# Wave 3 — Evidence-Gated Self-Service Delivery Flow: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the trust-and-paper delivery handoff with a three-step photo-evidence chain — seller photographs preparation, seller photographs dispatch with a system-issued delivery code visible, buyer photographs receipt and types that code — where the buyer's confirmation is what releases escrow, with no admin in the happy path.

**Architecture:** A new `out_for_delivery` order status sits between `preparing_shipment` and `delivered`. Steps 1 and 2 stay client transitions through the existing `executeOrderTransition` FSM, gated by `firestore.rules` requiring the evidence photo field to be present. The delivery code lives in a separate `deliveryCodes/{orderId}` collection (seller+admin readable, server-write-only) because Firestore has no field-level read denylist — this mirrors Wave 1's `paymentReferences` and Wave 2's `orderRefs`. Step 3 is a server callable: a rate-limited pre-transaction records the code attempt, then the existing `releaseOrderEscrow` transaction re-verifies the code authoritatively and releases escrow atomically in one commit.

**Tech Stack:** React 19 + TypeScript (Vite), Firebase v12 client SDK, Cloud Functions (CommonJS, firebase-functions v4), Firestore + Storage security rules, Vitest (node environment).

## Global Constraints

- **Spec deviation, deliberate:** the spec says the delivery code is hidden from the buyer "via Firestore rules field-level denylist". Firestore rules cannot hide a field on a document read — a granted read returns the whole document. The code therefore lives in its own document, `deliveryCodes/{orderId}`, exactly as Wave 1/Wave 2 did for their secrets. Never put `deliveryCode` on the order doc.
- **Money-touching writes are server-only.** `escrowStatus`, `status: 'completed'`, `receivedPhotoUrl`, `deliveredAt`, `deliveryCodeAttempts` are denylisted in `firestore.rules` and rejected by `executeOrderTransition`'s `forbiddenFields` guard. Only `releaseOrderEscrow` writes them.
- **No new notification events.** `functions/notify.js` `CHANNEL_POLICY` is mirrored by a live n8n workflow (21 events). `out_for_delivery` maps to the EXISTING `order_shipped` event in `onOrderStatusChanged`. Do not add a key to `CHANNEL_POLICY`.
- **No auto-complete cron, no protection window.** The buyer's step-3 confirmation is completion. Do not add a scheduler.
- **Vitest is `environment: 'node'`** — no jsdom, no `@testing-library/react`. Component rendering tests are impossible. Extract pure logic into `src/utils/*.ts` (or export it from the component file) and test that; verify components with `npm run build` plus a browser pass.
- **Delivery code format:** `DC-XXXXX`, 5 characters from the alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (no `0 O 1 I L`). Prefix is `DC-`, deliberately distinct from the `MZ-` order ref so the two are never confused on a parcel.
- **Delivery methods:** exactly `'hand'` and `'courier'`. No shipping-with-tracking.
- **Bilingual copy is Arabic-primary.** Every user-facing string added to a component follows the file's existing `isAr ? '…' : '…'` pattern. Arabic label for the new status is `خرج للتوصيل` (matches the label `FulfillmentSection` already uses for this concept), English is `Out for delivery`.
- **Run `npx vitest run` from the repo root** — it covers both `src/**/*.test.ts` and `functions/**/*.test.js`.

## File Structure

**New files**
- `functions/deliveryCode.js` — code alphabet, generation, validation, normalization (server twin).
- `src/utils/deliveryCode.ts` — validation + normalization (client twin; the client never generates).
- `functions/deliveryIssue.js` — `issueDeliveryCode` core: idempotent creation of `deliveryCodes/{orderId}`.
- `functions/deliveryConfirm.js` — `checkDeliveryConfirm` core: the rate-limited code-attempt gate.
- `src/utils/deliveryEvidence.ts` — pure UI-driving logic: which delivery step a viewer owes, and the client-side readiness checks.
- Sibling `.test.ts` / `.test.js` for each of the above.

**Modified files**
- `src/types.ts` — `Order.status` union + the new evidence fields.
- `src/utils/orderStatusGlossary.ts` — new status code, label, tone, `PAID_OR_BEYOND`.
- `src/utils/orderWorkflow.ts` — FSM edges, three new actions, role permissions.
- `src/utils/orderAdvance.ts` — admin hand-advance out of the new status.
- `src/utils/fulfillmentQueues.ts` + `functions/fulfillmentNudge.js` — bucket the new status.
- `firestore.rules` — `deliveryCodes` block, evidence gates, server-only denylist additions.
- `storage.rules` — `delivery-evidence/{orderId}/**` path.
- `functions/index.js` — `issueDeliveryCode` callable, `releaseOrderEscrow` new action, `onOrderStatusChanged` map.
- `functions/returns.js` — allow a return claim from `out_for_delivery`.
- `src/components/OrderDetailsView.tsx` — seller steps 1–2, buyer step 3.
- `src/components/admin/OrdersLedgerSection.tsx`, `src/components/SellerCenterView.tsx`, `src/components/ProfileView.tsx`, `src/components/SellerProfileModal.tsx` — status lists.

---

### Task 1: Delivery-code twins

The code is drawn server-side and typed back by the buyer, so the generator and the normalizer must agree exactly across the two runtimes — the same twin arrangement `functions/orderRef.js` / `src/utils/orderRef.ts` already uses.

**Files:**
- Create: `functions/deliveryCode.js`
- Create: `functions/deliveryCode.test.js`
- Create: `src/utils/deliveryCode.ts`
- Create: `src/utils/deliveryCode.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `functions/deliveryCode.js` → `DELIVERY_CODE_ALPHABET: string`, `generateDeliveryCode(pick?: (max: number) => number): string`, `isValidDeliveryCode(s: unknown): boolean`, `normalizeDeliveryCodeInput(s: unknown): string`
  - `src/utils/deliveryCode.ts` → `isValidDeliveryCode(s: unknown): boolean`, `normalizeDeliveryCodeInput(s: unknown): string`

- [ ] **Step 1: Write the failing server test**

Create `functions/deliveryCode.test.js`:

```js
// Wave 3 — delivery-code twin (server). The client twin
// src/utils/deliveryCode.ts MUST keep identical validation/normalization; the
// NORMALIZE_CASES table below is duplicated there on purpose.
import { describe, it, expect } from 'vitest';
import {
  DELIVERY_CODE_ALPHABET,
  generateDeliveryCode,
  isValidDeliveryCode,
  normalizeDeliveryCodeInput,
} from './deliveryCode.js';

const NORMALIZE_CASES = [
  ['dc-7k3qp', 'DC-7K3QP'],
  ['DC-7K3QP', 'DC-7K3QP'],
  ['  dc 7k3qp  ', 'DC-7K3QP'],
  ['7K3QP', 'DC-7K3QP'],
  ['dc7k3qp', 'DC-7K3QP'],
  ['DC-DC-7K3QP', 'DC-7K3QP'],
];

describe('deliveryCode — alphabet', () => {
  it('excludes the ambiguous glyphs 0 O 1 I L', () => {
    for (const ch of ['0', 'O', '1', 'I', 'L']) {
      expect(DELIVERY_CODE_ALPHABET.includes(ch)).toBe(false);
    }
  });
});

describe('generateDeliveryCode', () => {
  it('builds DC- plus five alphabet characters', () => {
    const code = generateDeliveryCode(() => 0);
    expect(code).toBe('DC-22222');
    expect(isValidDeliveryCode(code)).toBe(true);
  });

  it('draws every character from the injected picker', () => {
    let i = 0;
    const code = generateDeliveryCode(() => i++);
    expect(code).toBe('DC-23456');
  });

  it('produces valid codes with the real RNG', () => {
    for (let i = 0; i < 50; i++) {
      expect(isValidDeliveryCode(generateDeliveryCode())).toBe(true);
    }
  });
});

describe('isValidDeliveryCode', () => {
  it('rejects a wrong prefix, wrong length, ambiguous glyphs and non-strings', () => {
    expect(isValidDeliveryCode('MZ-7K3QP')).toBe(false);
    expect(isValidDeliveryCode('DC-7K3Q')).toBe(false);
    expect(isValidDeliveryCode('DC-7K3QPP')).toBe(false);
    expect(isValidDeliveryCode('DC-7K3Q0')).toBe(false);
    expect(isValidDeliveryCode('dc-7k3qp')).toBe(false);
    expect(isValidDeliveryCode(undefined)).toBe(false);
    expect(isValidDeliveryCode(null)).toBe(false);
    expect(isValidDeliveryCode(12345)).toBe(false);
  });
});

describe('normalizeDeliveryCodeInput', () => {
  it('coerces buyer typing toward the canonical form', () => {
    for (const [input, expected] of NORMALIZE_CASES) {
      expect(normalizeDeliveryCodeInput(input)).toBe(expected);
    }
  });

  it('never throws on junk input', () => {
    expect(normalizeDeliveryCodeInput(undefined)).toBe('DC-UNDEFINED');
    expect(normalizeDeliveryCodeInput(null)).toBe('DC-NULL');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run functions/deliveryCode.test.js`
Expected: FAIL — `Failed to load ./deliveryCode.js`

- [ ] **Step 3: Write the server twin**

Create `functions/deliveryCode.js`:

```js
/**
 * Wave 3 — delivery codes: the string the seller writes on the parcel, which
 * must be legible in BOTH the seller's dispatch photo and the buyer's receipt
 * photo. Same code out, same code in — that match is the proof the network
 * produces for itself, with no admin in the loop.
 *
 * `src/utils/deliveryCode.ts` is the client twin and MUST keep IDENTICAL
 * validation + normalization: the buyer types the code and the server compares
 * normalized forms, so a disagreement would reject a correct code. Only this
 * file generates — the client never draws a code.
 *
 * The alphabet excludes 0 O 1 I L: this code is handwritten on a box and read
 * back off a phone photo, so a glyph pair that can be confused would produce a
 * mismatch on a genuinely delivered order.
 *
 * The `DC-` prefix is deliberately NOT `MZ-` (the order reference, orderRef.js)
 * — the two appear on the same parcel and must never be mistaken for each other.
 */
const crypto = require('crypto');

const DELIVERY_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const DELIVERY_CODE_RE = /^DC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/;

const cryptoPick = (max) => crypto.randomInt(max);

/**
 * Build a code: `'DC-' + 5 chars` drawn from DELIVERY_CODE_ALPHABET.
 * `pick` is injectable so tests can force a fixed code.
 */
function generateDeliveryCode(pick = cryptoPick) {
  let out = '';
  for (let i = 0; i < 5; i++) {
    out += DELIVERY_CODE_ALPHABET[pick(DELIVERY_CODE_ALPHABET.length)];
  }
  return 'DC-' + out;
}

function isValidDeliveryCode(s) {
  return typeof s === 'string' && DELIVERY_CODE_RE.test(s);
}

/**
 * Coerce buyer-typed input toward a canonical code: trim, uppercase, strip
 * spaces and dashes, ensure a single `DC-` prefix. Never throws — junk in
 * yields a non-matching string, which the caller compares and rejects.
 */
function normalizeDeliveryCodeInput(s) {
  let v = String(s).trim().toUpperCase().replace(/[\s-]+/g, '');
  v = v.replace(/^(DC)+/, '');
  return 'DC-' + v;
}

module.exports = {
  DELIVERY_CODE_ALPHABET,
  generateDeliveryCode,
  isValidDeliveryCode,
  normalizeDeliveryCodeInput,
};
```

- [ ] **Step 4: Run the server test to verify it passes**

Run: `npx vitest run functions/deliveryCode.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Write the failing client-twin test**

Create `src/utils/deliveryCode.test.ts`:

```ts
// Wave 3 — delivery-code twin (client). NORMALIZE_CASES is duplicated from
// functions/deliveryCode.test.js on purpose: the buyer types the code here and
// the server compares normalized forms, so the two must agree exactly.
import { describe, it, expect } from 'vitest';
import { isValidDeliveryCode, normalizeDeliveryCodeInput } from './deliveryCode';

const NORMALIZE_CASES: [string, string][] = [
  ['dc-7k3qp', 'DC-7K3QP'],
  ['DC-7K3QP', 'DC-7K3QP'],
  ['  dc 7k3qp  ', 'DC-7K3QP'],
  ['7K3QP', 'DC-7K3QP'],
  ['dc7k3qp', 'DC-7K3QP'],
  ['DC-DC-7K3QP', 'DC-7K3QP'],
];

describe('deliveryCode (client twin)', () => {
  it('normalizes buyer typing the same way the server does', () => {
    for (const [input, expected] of NORMALIZE_CASES) {
      expect(normalizeDeliveryCodeInput(input)).toBe(expected);
    }
  });

  it('validates exactly what the server validates', () => {
    expect(isValidDeliveryCode('DC-7K3QP')).toBe(true);
    expect(isValidDeliveryCode('MZ-7K3QP')).toBe(false);
    expect(isValidDeliveryCode('DC-7K3Q0')).toBe(false);
    expect(isValidDeliveryCode('dc-7k3qp')).toBe(false);
    expect(isValidDeliveryCode(undefined)).toBe(false);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/utils/deliveryCode.test.ts`
Expected: FAIL — cannot resolve `./deliveryCode`

- [ ] **Step 7: Write the client twin**

Create `src/utils/deliveryCode.ts`:

```ts
/**
 * Wave 3 — delivery-code twin (client).
 *
 * `functions/deliveryCode.js` is the server twin and owns generation. This file
 * MUST keep IDENTICAL validation + normalization: the buyer types the code into
 * the confirm form and the server compares NORMALIZED forms, so any drift here
 * rejects a correct code on a genuinely delivered order.
 *
 * No generator lives here on purpose — a client-drawn delivery code would be a
 * code the buyer knows without ever having seen the parcel.
 */
const DELIVERY_CODE_RE = /^DC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/;

export function isValidDeliveryCode(s: unknown): boolean {
  return typeof s === 'string' && DELIVERY_CODE_RE.test(s);
}

export function normalizeDeliveryCodeInput(s: unknown): string {
  let v = String(s).trim().toUpperCase().replace(/[\s-]+/g, '');
  v = v.replace(/^(DC)+/, '');
  return 'DC-' + v;
}
```

- [ ] **Step 8: Run both tests**

Run: `npx vitest run src/utils/deliveryCode.test.ts functions/deliveryCode.test.js`
Expected: PASS (7 tests total)

- [ ] **Step 9: Commit**

```bash
git add functions/deliveryCode.js functions/deliveryCode.test.js src/utils/deliveryCode.ts src/utils/deliveryCode.test.ts
git commit -m "feat(wave3): delivery-code twins (DC-XXXXX, unambiguous alphabet)"
```

---

### Task 2: The `out_for_delivery` status

Pure data plumbing: the status must exist, be labelled, count as a real sale, and bucket into the admin fulfillment queue before any transition can produce it.

**Files:**
- Modify: `src/types.ts:313` (Order.status union) and the Order field block around `src/types.ts:371`
- Modify: `src/utils/orderStatusGlossary.ts:21-32` (code union), `:61-117` (glossary), `:152-158` (`PAID_OR_BEYOND`)
- Modify: `src/utils/fulfillmentQueues.ts:36`
- Modify: `functions/fulfillmentNudge.js:30`
- Modify: `src/utils/orderAdvance.ts:23-27`
- Test: `src/utils/orderStatusGlossary.test.ts`, `src/utils/fulfillmentQueues.test.ts`, `functions/fulfillmentNudge.test.js`, `src/utils/orderAdvance.test.ts` (all exist — add cases)

**Interfaces:**
- Consumes: nothing.
- Produces: the string literal `'out_for_delivery'` as a valid `Order['status']` / `OrderStatusCode`; `Order.prepPhotoUrl`, `Order.sentPhotoUrl`, `Order.receivedPhotoUrl`, `Order.deliveryMethod`, `Order.deliveryCodeAttempts`, `Order.deliveredAt` optional fields; `bucketOrder({status:'out_for_delivery'}) === 'awaiting_delivery'`; `nextAdvance('out_for_delivery') === { action: 'mark_delivered', to: 'delivered' }`.

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/orderStatusGlossary.test.ts`:

```ts
describe('Wave 3 — out_for_delivery', () => {
  it('has a human label in both languages, never the raw code', () => {
    expect(getOrderStatusChip('out_for_delivery', 'ar').label).toBe('خرج للتوصيل');
    expect(getOrderStatusChip('out_for_delivery', 'en').label).toBe('Out for delivery');
    expect(getOrderStatusChip('out_for_delivery', 'en').tone).toBe('info');
  });

  it('counts as a real sale — the buyer has paid and the goods are moving', () => {
    expect(PAID_OR_BEYOND.has('out_for_delivery')).toBe(true);
  });
});
```

Append to `src/utils/fulfillmentQueues.test.ts`:

```ts
describe('Wave 3 — out_for_delivery buckets with the goods in transit', () => {
  it('buckets as awaiting_delivery, same as legacy shipped', () => {
    expect(bucketOrder({ status: 'out_for_delivery' })).toBe('awaiting_delivery');
  });

  it('goes overdue on the awaiting_delivery SLA (5 days), not the payment window', () => {
    const now = 1_000_000_000_000;
    const fiveDays = 5 * 24 * 60 * 60 * 1000;
    expect(isOverdue({ status: 'out_for_delivery', updatedAtMs: now - fiveDays - 1 }, now)).toBe(true);
    expect(isOverdue({ status: 'out_for_delivery', updatedAtMs: now - 1000 }, now)).toBe(false);
  });
});
```

Append to `functions/fulfillmentNudge.test.js`:

```js
describe('Wave 3 — out_for_delivery bucket parity with the client', () => {
  it('buckets as awaiting_delivery', () => {
    expect(bucketOrder({ status: 'out_for_delivery' })).toBe('awaiting_delivery');
  });
});
```

Append to `src/utils/orderAdvance.test.ts`:

```ts
describe('Wave 3 — the relay can still hand-advance a stalled evidence flow', () => {
  it('offers "delivered" out of out_for_delivery — a claim of fact, no money', () => {
    expect(nextAdvance('out_for_delivery')).toEqual({ action: 'mark_delivered', to: 'delivered' });
  });

  it('still offers nothing at delivered — the next step releases money', () => {
    expect(nextAdvance('delivered')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/utils/orderStatusGlossary.test.ts src/utils/fulfillmentQueues.test.ts functions/fulfillmentNudge.test.js src/utils/orderAdvance.test.ts`
Expected: FAIL — chip falls back to "Processing"/"قيد المعالجة", `bucketOrder` returns `null`, `nextAdvance` returns `null`

- [ ] **Step 3: Add the status code and glossary entry**

In `src/utils/orderStatusGlossary.ts`, add to the `OrderStatusCode` union after `'shipped'`:

```ts
  | 'out_for_delivery'
```

Add to `ORDER_STATUS_GLOSSARY` after the `shipped` entry:

```ts
  // Wave 3 — the seller has photographed the parcel leaving with the delivery
  // code visible. Distinct from legacy `shipped`, which is the admin relay's
  // phone-recorded dispatch with no evidence attached.
  out_for_delivery: {
    labelAr: 'خرج للتوصيل',
    labelEn: 'Out for delivery',
    tone: 'info',
  },
```

Add `'out_for_delivery'` to the `PAID_OR_BEYOND` set, after `'shipped'`.

- [ ] **Step 4: Add the status to the Order type**

In `src/types.ts:313`, add `"out_for_delivery"` to the `status` union after `"shipped"`. Then add the evidence fields next to `trackingNumber` (`src/types.ts:371`):

```ts
  /**
   * Wave 3 — evidence-gated delivery. `prepPhotoUrl` and `sentPhotoUrl` are
   * SELLER-written (firestore.rules requires each before the matching status
   * write); `receivedPhotoUrl`, `deliveredAt` and `deliveryCodeAttempts` are
   * SERVER-only via releaseOrderEscrow. The delivery code itself is NEVER on
   * this doc — the buyer can read the whole order, so it lives in
   * deliveryCodes/{orderId} (seller + admin read only).
   */
  prepPhotoUrl?: string;
  sentPhotoUrl?: string;
  receivedPhotoUrl?: string;
  deliveryMethod?: 'hand' | 'courier';
  deliveryCodeAttempts?: number;
  deliveredAt?: any;
```

- [ ] **Step 5: Bucket the status on both sides**

In `src/utils/fulfillmentQueues.ts`, after the `shipped` line (`:36`):

```ts
  // Wave 3 — evidence-gated dispatch lands in the same queue as legacy shipped:
  // goods are with the buyer's courier, the team is waiting on the buyer.
  if (order.status === 'out_for_delivery') return 'awaiting_delivery';
```

Make the identical change in `functions/fulfillmentNudge.js` after its `shipped` line (`:30`) — that file re-implements `bucketOrder` because it is CommonJS and cannot import the TS module; the mirrored test above is what keeps them honest.

- [ ] **Step 6: Let the relay advance out of the new status**

In `src/utils/orderAdvance.ts`, add to `ADVANCE_MAP`:

```ts
  // Wave 3 — if the buyer never confirms (lost phone, no app), the relay can
  // still record the fact that the goods arrived. Same money-free claim as the
  // legacy `shipped` entry above; acceptance still has to happen separately.
  out_for_delivery: { action: 'mark_delivered', to: 'delivered' },
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/utils/orderStatusGlossary.test.ts src/utils/fulfillmentQueues.test.ts functions/fulfillmentNudge.test.js src/utils/orderAdvance.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/utils/orderStatusGlossary.ts src/utils/fulfillmentQueues.ts src/utils/orderAdvance.ts functions/fulfillmentNudge.js src/utils/orderStatusGlossary.test.ts src/utils/fulfillmentQueues.test.ts src/utils/orderAdvance.test.ts functions/fulfillmentNudge.test.js
git commit -m "feat(wave3): add out_for_delivery status, labels, bucket and evidence fields"
```

---

### Task 3: FSM actions for steps 1 and 2

The seller's two photo-advances are client transitions (spec decision 4). This task makes `executeOrderTransition` refuse to move the order without the evidence — the same requirement `firestore.rules` enforces in Task 4, so a bypassed UI still cannot produce an evidence-free advance.

**Files:**
- Modify: `src/utils/orderWorkflow.ts:7` (OrderStatus), `:10-27` (VALID_TRANSITIONS), `:60-78` (checkRolePermission), `:83-103` (action union + extraFields), `:198-311` (switch)
- Test: `src/utils/orderWorkflow.test.ts`

**Interfaces:**
- Consumes: `Order['status']` including `'out_for_delivery'` (Task 2).
- Produces: three new actions on `executeOrderTransition` —
  - `'upload_prep_photo'` with `extraFields.prepPhotoUrl: string` → status `preparing_shipment`
  - `'mark_out_for_delivery'` with `extraFields.sentPhotoUrl: string` and `extraFields.deliveryMethod: 'hand' | 'courier'` → status `out_for_delivery`
  - `'confirm_receipt'` with `extraFields.deliveryCode: string` and `extraFields.receivedPhotoUrl: string` → delegates to the `releaseOrderEscrow` callable with `action: 'buyer_confirm_receipt'` (server wiring lands in Task 6)

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/orderWorkflow.test.ts`. The file already has a mocked-firebase harness — reuse the same mocking style the existing `mark_delivered` describe block uses (read `src/utils/orderWorkflow.test.ts:154-227` before writing these, and copy its mock setup verbatim rather than inventing a new one):

```ts
describe('Wave 3 — seller evidence steps refuse to advance without the photo', () => {
  it('upload_prep_photo throws when no prep photo is supplied', async () => {
    const order = { id: 'o1', status: 'paid', sellerId: 's1', buyerId: 'b1' } as any;
    const seller = { id: 's1', email: 's@x.com', name: 'S', role: 'seller' as const };
    await expect(executeOrderTransition(order, 'upload_prep_photo', seller, {}))
      .rejects.toThrow(/photo/i);
  });

  it('mark_out_for_delivery throws when no dispatch photo is supplied', async () => {
    const order = { id: 'o1', status: 'preparing_shipment', sellerId: 's1', buyerId: 'b1' } as any;
    const seller = { id: 's1', email: 's@x.com', name: 'S', role: 'seller' as const };
    await expect(executeOrderTransition(order, 'mark_out_for_delivery', seller, { deliveryMethod: 'hand' }))
      .rejects.toThrow(/photo/i);
  });

  it('mark_out_for_delivery throws on an unknown delivery method', async () => {
    const order = { id: 'o1', status: 'preparing_shipment', sellerId: 's1', buyerId: 'b1' } as any;
    const seller = { id: 's1', email: 's@x.com', name: 'S', role: 'seller' as const };
    await expect(executeOrderTransition(order, 'mark_out_for_delivery', seller, {
      sentPhotoUrl: 'https://x/p.jpg',
      deliveryMethod: 'drone' as any,
    })).rejects.toThrow(/delivery method/i);
  });

  it('the buyer may not take a seller evidence step', async () => {
    const order = { id: 'o1', status: 'paid', sellerId: 's1', buyerId: 'b1' } as any;
    const buyer = { id: 'b1', email: 'b@x.com', name: 'B', role: 'user' as const };
    await expect(executeOrderTransition(order, 'upload_prep_photo', buyer, {
      prepPhotoUrl: 'https://x/p.jpg',
    })).rejects.toThrow(/permission/i);
  });
});

describe('Wave 3 — seller evidence steps write the photo and move the goods, never money', () => {
  it('upload_prep_photo stamps prepPhotoUrl and no escrow field', async () => {
    // Assert against the captured updateDoc payload, exactly as the existing
    // mark_delivered test does.
    // expected: { status: 'preparing_shipment', shippingStatus: 'preparing',
    //             prepPhotoUrl: 'https://x/p.jpg' } plus updatedAt
  });

  it('mark_out_for_delivery stamps sentPhotoUrl + deliveryMethod and no escrow field', async () => {
    // expected: { status: 'out_for_delivery', shippingStatus: 'shipped',
    //             sentPhotoUrl: 'https://x/s.jpg', deliveryMethod: 'courier' } plus updatedAt
  });
});

describe('Wave 3 — the FSM knows the new edges', () => {
  it('allows preparing_shipment -> out_for_delivery and keeps the legacy shipped edge', () => {
    expect(VALID_TRANSITIONS.preparing_shipment).toContain('out_for_delivery');
    expect(VALID_TRANSITIONS.preparing_shipment).toContain('shipped');
  });

  it('allows out_for_delivery -> delivered and -> disputed', () => {
    expect(VALID_TRANSITIONS.out_for_delivery).toEqual(
      expect.arrayContaining(['delivered', 'disputed'])
    );
  });

  it('never allows out_for_delivery -> completed from the client', () => {
    expect(VALID_TRANSITIONS.out_for_delivery).not.toContain('completed');
  });
});
```

Fill the two payload assertions in the second describe block with the real captured-payload assertions from the existing harness — do not leave them as comments.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/utils/orderWorkflow.test.ts`
Expected: FAIL — `Unknown action type or action requires server-side processing: upload_prep_photo`, and `VALID_TRANSITIONS.out_for_delivery` is undefined

- [ ] **Step 3: Extend the FSM**

In `src/utils/orderWorkflow.ts:7`, add the status to the `OrderStatus` union after `"shipped"`:

```ts
export type OrderStatus = "waiting_payment" | "paid" | "preparing_shipment" | "out_for_delivery" | "shipped" | "delivered" | "completed" | "disputed" | "cancelled" | "refunded";
```

In `VALID_TRANSITIONS`, replace the `preparing_shipment` line and add the new key:

```ts
  // Wave 3 — the evidence flow's dispatch edge. `shipped` stays alongside it:
  // that is the admin relay's phone-recorded dispatch, which carries no photo
  // and is the fallback when a seller cannot use the app at all.
  preparing_shipment: ['out_for_delivery', 'shipped', 'disputed'],
  // `completed` is deliberately absent — the buyer's confirmation releases money,
  // and every money-touching transition is the server's (releaseOrderEscrow).
  out_for_delivery: ['delivered', 'disputed'],
```

- [ ] **Step 4: Extend role permissions**

In `checkRolePermission`, add to `sellerActions` and `buyerActions`:

```ts
  const buyerActions = ['pay', 'cancel_before_payment', 'confirm_delivery', 'confirm_receipt', 'open_dispute'];
  const sellerActions = ['prepare_shipment', 'mark_shipped', 'mark_delivered', 'upload_tracking', 'open_dispute', 'upload_prep_photo', 'mark_out_for_delivery'];
```

- [ ] **Step 5: Widen the action union and extraFields**

In the `executeOrderTransition` signature (`:83`), add `'upload_prep_photo' | 'mark_out_for_delivery' | 'confirm_receipt'` to the action union, and add to `extraFields`:

```ts
    /** Wave 3 — seller step 1: photo of the item being prepared. */
    prepPhotoUrl?: string;
    /** Wave 3 — seller step 2: photo of it sent, delivery code visible. */
    sentPhotoUrl?: string;
    /** Wave 3 — seller step 2: how it is travelling. */
    deliveryMethod?: 'hand' | 'courier';
    /** Wave 3 — buyer step 3: photo of it received, delivery code visible. Passed to the server callable, never written from here. */
    receivedPhotoUrl?: string;
    /** Wave 3 — buyer step 3: the code the buyer typed off the parcel. Verified server-side. */
    deliveryCode?: string;
```

- [ ] **Step 6: Route `confirm_receipt` to the callable**

Extend the existing escrow-delegation block (`:120-158`). Add `action === 'confirm_receipt'` to the `if` condition, widen the callable's request type, and set the CF action:

```ts
    const releaseCallable = await getCallableFunction<
      {
        orderId: string;
        action: 'buyer_confirm_delivery' | 'buyer_confirm_receipt' | 'admin_release' | 'admin_force_close';
        deliveryCode?: string;
        receivedPhotoUrl?: string;
      },
      { success: boolean; message: string; alreadyReleased?: boolean }
    >('releaseOrderEscrow');
```

```ts
    } else if (action === 'confirm_receipt') {
      cfAction = 'buyer_confirm_receipt';
    }
```

and pass the evidence through, conditionally so a legacy confirm sends no stray keys:

```ts
      const result = await releaseCallable({
        orderId: order.id,
        action: cfAction,
        ...(cfAction === 'buyer_confirm_receipt'
          ? {
              deliveryCode: extraFields?.deliveryCode || '',
              receivedPhotoUrl: extraFields?.receivedPhotoUrl || '',
            }
          : {}),
      });
```

- [ ] **Step 7: Add the two seller cases to the switch**

In the `switch (action as any)` block, after the `prepare_shipment` case:

```ts
    case 'upload_prep_photo': {
      // Wave 3 step 1. The photo is the gate, not a decoration:
      // firestore.rules refuses a write that sets status to
      // 'preparing_shipment' without prepPhotoUrl, so a missing URL here would
      // fail at the rules layer with a raw permission error. Throw a legible
      // one first.
      const prepPhoto = typeof extraFields?.prepPhotoUrl === 'string' ? extraFields.prepPhotoUrl.trim() : '';
      if (!prepPhoto) {
        throw new Error('A photo of the item being prepared is required to start this step.');
      }
      toStatus = 'preparing_shipment';
      updateFields = {
        status: 'preparing_shipment',
        shippingStatus: 'preparing',
        prepPhotoUrl: prepPhoto
      };
      activityType = 'Seller Started Shipment';
      activityMessageAr = 'رفع البائع صورة المنتج أثناء التجهيز.';
      activityMessageEn = 'Seller uploaded a photo of the item being prepared.';
      break;
    }

    case 'mark_out_for_delivery': {
      // Wave 3 step 2. Both fields are required by firestore.rules on any write
      // that sets status to 'out_for_delivery' — same reasoning as step 1.
      const sentPhoto = typeof extraFields?.sentPhotoUrl === 'string' ? extraFields.sentPhotoUrl.trim() : '';
      if (!sentPhoto) {
        throw new Error('A photo of the item sent, with the delivery code visible, is required.');
      }
      const method = extraFields?.deliveryMethod;
      if (method !== 'hand' && method !== 'courier') {
        throw new Error('Choose a delivery method: hand delivery or local courier.');
      }
      toStatus = 'out_for_delivery';
      updateFields = {
        status: 'out_for_delivery',
        // shippingStatus stays on the legacy 4-value union ('shipped' is its
        // in-transit value) — MyOrdersList/SoldOrdersList render off it.
        shippingStatus: 'shipped',
        sentPhotoUrl: sentPhoto,
        deliveryMethod: method
      };
      activityType = 'Out For Delivery';
      activityMessageAr = 'خرج المنتج للتوصيل — رفع البائع صورة الإرسال مع ظهور رمز التسليم.';
      activityMessageEn = 'Item out for delivery — seller uploaded the dispatch photo with the delivery code visible.';
      break;
    }
```

Note the block braces: the existing `mark_shipped` case declares `const tracking` without braces, so a bare `const` in a new case would be a redeclaration hazard in the same block scope. Both new cases are wrapped.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/utils/orderWorkflow.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/utils/orderWorkflow.ts src/utils/orderWorkflow.test.ts
git commit -m "feat(wave3): FSM actions for the seller's two evidence steps + buyer confirm_receipt routing"
```

---

### Task 4: Security rules — the evidence gate and the code's hiding place

Rules are the layer that actually enforces the model: a photo-less advance must fail even if the UI is bypassed, and the buyer must not be able to read the code they are supposed to learn from the parcel.

**Files:**
- Modify: `firestore.rules:336-338` (add the `deliveryCodes` block after `orderRefs`), `:355-375` (denylist), `:376-397` (evidence gates)
- Modify: `storage.rules` (new `delivery-evidence` block after the `returns` block)

**Interfaces:**
- Consumes: `Order.prepPhotoUrl` / `sentPhotoUrl` / `deliveryMethod` (Task 2).
- Produces: `deliveryCodes/{orderId}` — `{ orderId, sellerId, buyerId, code, createdAt }`, readable by that order's seller and by admins, writable by nobody (Admin SDK only). Storage prefix `delivery-evidence/{orderId}/`.

- [ ] **Step 1: Add the `deliveryCodes` collection block**

In `firestore.rules`, immediately after the `orderRefs` block (`:336-338`):

```
    // Wave 3 — delivery codes. The seller writes this code on the parcel; it
    // must appear in the seller's dispatch photo AND the buyer's receipt photo,
    // and the buyer also types it back to confirm. It is therefore a SECRET
    // FROM THE BUYER — they must learn it from the physical handover, not from
    // the app.
    //
    // It lives in its own document for a reason that is easy to get wrong:
    // Firestore has NO field-level read denylist. `orders/{orderId}` grants the
    // buyer `allow read`, and a granted read returns EVERY field — so a
    // `deliveryCode` key on the order doc would be readable by the one person
    // it must be hidden from, no matter what the update denylist says. Same
    // lesson as Wave 1's paymentReferences and Wave 2's orderRefs.
    //
    // sellerId is denormalized onto this doc so the read rule costs no get().
    // Written ONLY by issueDeliveryCode / releaseOrderEscrow via the Admin SDK,
    // which bypasses rules.
    match /deliveryCodes/{orderId} {
      allow read: if isSignedIn() && (resource.data.sellerId == request.auth.uid || isAdmin());
      allow write: if false;
    }
```

- [ ] **Step 2: Add the server-only fields to the orders denylist**

In the `orders/{orderId}` update rule, append to the `affectedKeys().hasAny([...])` denylist (after the `resolutionNotes, …` line at `:374`):

```
            // Wave 3 — the buyer's receipt evidence, the delivery timestamp and
            // the code-attempt counter are all written by releaseOrderEscrow /
            // the confirm gate (Admin SDK). A client-written receivedPhotoUrl
            // would be the buyer asserting their own proof of delivery, and a
            // client-writable deliveryCodeAttempts would reset the brute-force
            // counter on every guess.
            'receivedPhotoUrl', 'deliveredAt', 'deliveryCodeAttempts',
            'deliveryCode', 'deliveryConfirmedBy',
```

- [ ] **Step 3: Add the evidence gates**

In the same rule, inside the non-admin branch, after the `deliveryAddress`/`deliveryPhone` clause (`:379-382`) and before the terminal-transition guard:

```
          // Wave 3 — evidence gates. Each seller step may only produce its
          // status if the photo that justifies it is on the resulting document.
          //
          // The `preparing_shipment` gate is scoped to writes that SET the
          // status. Without that exemption, a legacy order sitting in
          // `preparing_shipment` from before Wave 3 (no prepPhotoUrl) would be
          // frozen: its seller could not open a dispute or record anything else,
          // because every later write would re-demand a photo that was never
          // taken. `out_for_delivery` needs no such exemption — no document has
          // ever held that status, so there is no legacy shape to strand.
          (
            request.resource.data.status != 'preparing_shipment' ||
            !request.resource.data.diff(resource.data).affectedKeys().hasAny(['status']) ||
            (request.resource.data.prepPhotoUrl is string && request.resource.data.prepPhotoUrl.size() > 0)
          ) &&
          (
            request.resource.data.status != 'out_for_delivery' ||
            (
              request.resource.data.sentPhotoUrl is string &&
              request.resource.data.sentPhotoUrl.size() > 0 &&
              request.resource.data.deliveryMethod in ['hand', 'courier']
            )
          ) &&
          // Dispatch evidence is the SELLER's claim to make. A buyer who could
          // write sentPhotoUrl could manufacture the seller's half of the
          // evidence chain and then confirm against it.
          (
            !request.resource.data.diff(resource.data).affectedKeys().hasAny(['prepPhotoUrl', 'sentPhotoUrl', 'deliveryMethod']) ||
            resource.data.sellerId == request.auth.uid
          ) &&
```

- [ ] **Step 4: Add the Storage path**

In `storage.rules`, after the `returns/` block:

```
    // 5. Wave 3 delivery evidence. Three photos per order: the seller's
    // preparation shot, the seller's dispatch shot (delivery code visible) and
    // the buyer's receipt shot (same code visible). Authoritative ownership
    // checks live in firestore.rules (which party may write which field) and in
    // the confirm callable; this rule gates on any authenticated user,
    // image-only, ≤10MB — the same shape as the returns path above, and for the
    // same reason: counterparty + admin must all be able to read the chain when
    // a dispute is adjudicated.
    match /delivery-evidence/{orderId}/{fileName=**} {
      allow read: if isSignedIn();
      allow create, update: if isSignedIn()
                    && request.resource.contentType.matches('image/.*')
                    && request.resource.size <= 10 * 1024 * 1024;
      allow delete: if isAdmin();
    }
```

- [ ] **Step 5: Compile-check both rule files**

Run: `firebase deploy --only firestore:rules,storage --project mazadjoapp --dry-run`
Expected: compiles clean, no release published. A syntax error here must be fixed before proceeding — CI uses the same compiler.

- [ ] **Step 6: Evaluate the rules against synthetic requests**

There is no emulator and no `@firebase/rules-unit-testing` in this repo. Use the Firebase Rules test endpoint, which evaluates inline source and touches no data:

`POST https://firebaserules.googleapis.com/v1/projects/mazadjoapp:test` with the contents of `firestore.rules` as the inline source.

Write the runner as a throwaway script under the scratch directory (NOT committed) and cover at minimum:

1. Seller sets `status: 'preparing_shipment'` **with** `prepPhotoUrl` → ALLOW
2. Seller sets `status: 'preparing_shipment'` **without** `prepPhotoUrl` → DENY
3. Seller sets `status: 'out_for_delivery'` with `sentPhotoUrl` + `deliveryMethod: 'courier'` → ALLOW
4. Same but `deliveryMethod: 'drone'` → DENY
5. Same but no `sentPhotoUrl` → DENY
6. **Buyer** sets `sentPhotoUrl` → DENY
7. Buyer writes `receivedPhotoUrl` → DENY
8. Buyer writes `deliveryCodeAttempts: 0` → DENY
9. Buyer reads `deliveryCodes/{orderId}` → DENY
10. Seller reads `deliveryCodes/{orderId}` → ALLOW
11. Any client writes `deliveryCodes/{orderId}` → DENY
12. Legacy order already in `preparing_shipment` with NO `prepPhotoUrl`, seller writes `disputeReason` only (no status key) → ALLOW (the legacy-strand exemption)

**Run every case against the pre-change `firestore.rules` as a control** (`git show HEAD:firestore.rules`). Cases 1–12 must produce different verdicts before and after where the rule changed; if a verdict does not flip, the endpoint is not evaluating the source you passed and the whole run is meaningless.

Record the verdict table in the commit message.

- [ ] **Step 7: Commit**

```bash
git add firestore.rules storage.rules
git commit -m "feat(wave3): rules — deliveryCodes secret store, photo gates, server-only receipt fields"
```

---

### Task 5: `issueDeliveryCode` callable

The seller needs the code before they can photograph it on the parcel, so it is issued at step 1 rather than at dispatch. Idempotent: a re-open, a retry or a second device must never rotate a code that is already written on a box.

**Files:**
- Create: `functions/deliveryIssue.js`
- Create: `functions/deliveryIssue.test.js`
- Modify: `functions/index.js` (require at the top with the other core modules near `:23-24`; the callable next to `submitOrderPayment` at `:1909`)

**Interfaces:**
- Consumes: `generateDeliveryCode`, `isValidDeliveryCode` from `functions/deliveryCode.js` (Task 1).
- Produces: `issueDeliveryCode(deps, { orderId, actorUid, isAdmin }) => Promise<{ code: string, created: boolean }>` where `deps = { db, Timestamp, now?, generate? }`; callable `issueDeliveryCode({ orderId }) => { success: true, code, created }`.

- [ ] **Step 1: Write the failing test**

Create `functions/deliveryIssue.test.js` — copy the Firestore mock from `functions/orderPaymentSubmit.test.js:9-52` verbatim (it is test-local by design in this repo):

```js
// Wave 3 — delivery-code issuance. Idempotency is the whole point: the code
// gets handwritten on a physical parcel, so a second issue that returned a
// DIFFERENT code would invalidate a box already in transit.
import { describe, it, expect } from 'vitest';
import { issueDeliveryCode } from './deliveryIssue.js';

// ---- Firestore mock: copied from functions/orderPaymentSubmit.test.js -------
// (paste makeSnapshot / makeFakeDb / FakeTimestamp / deps here verbatim)

describe('issueDeliveryCode', () => {
  it('creates deliveryCodes/{orderId} for the seller and returns the code', async () => {
    const db = makeFakeDb({ 'orders/o1': { sellerId: 's1', buyerId: 'b1', status: 'paid' } });
    const res = await issueDeliveryCode(
      { ...deps(db), generate: () => 'DC-7K3QP' },
      { orderId: 'o1', actorUid: 's1' }
    );
    expect(res).toEqual({ code: 'DC-7K3QP', created: true });
    const write = db._writes.find(w => w.path === 'deliveryCodes/o1');
    expect(write.data.code).toBe('DC-7K3QP');
    expect(write.data.sellerId).toBe('s1');
    expect(write.data.buyerId).toBe('b1');
  });

  it('is idempotent — an existing valid code is returned, never rotated', async () => {
    const db = makeFakeDb({
      'orders/o1': { sellerId: 's1', buyerId: 'b1', status: 'preparing_shipment' },
      'deliveryCodes/o1': { code: 'DC-ABCDE', sellerId: 's1' },
    });
    const res = await issueDeliveryCode(
      { ...deps(db), generate: () => 'DC-ZZZZZ' },
      { orderId: 'o1', actorUid: 's1' }
    );
    expect(res).toEqual({ code: 'DC-ABCDE', created: false });
    expect(db._writes.find(w => w.path === 'deliveryCodes/o1')).toBeUndefined();
  });

  it('replaces a corrupt stored code rather than handing it back', async () => {
    const db = makeFakeDb({
      'orders/o1': { sellerId: 's1', buyerId: 'b1', status: 'paid' },
      'deliveryCodes/o1': { code: 'garbage', sellerId: 's1' },
    });
    const res = await issueDeliveryCode(
      { ...deps(db), generate: () => 'DC-7K3QP' },
      { orderId: 'o1', actorUid: 's1' }
    );
    expect(res).toEqual({ code: 'DC-7K3QP', created: true });
  });

  it('refuses a caller who is not the seller', async () => {
    const db = makeFakeDb({ 'orders/o1': { sellerId: 's1', buyerId: 'b1', status: 'paid' } });
    await expect(
      issueDeliveryCode(deps(db), { orderId: 'o1', actorUid: 'b1' })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('lets an admin issue on the seller behalf', async () => {
    const db = makeFakeDb({ 'orders/o1': { sellerId: 's1', buyerId: 'b1', status: 'paid' } });
    const res = await issueDeliveryCode(
      { ...deps(db), generate: () => 'DC-7K3QP' },
      { orderId: 'o1', actorUid: 'admin1', isAdmin: true }
    );
    expect(res.code).toBe('DC-7K3QP');
  });

  it('refuses an order that does not exist', async () => {
    const db = makeFakeDb({});
    await expect(
      issueDeliveryCode(deps(db), { orderId: 'nope', actorUid: 's1' })
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run functions/deliveryIssue.test.js`
Expected: FAIL — `Failed to load ./deliveryIssue.js`

- [ ] **Step 3: Write the module**

Create `functions/deliveryIssue.js`:

```js
/**
 * Wave 3 — issue the delivery code for an order.
 *
 * Called by the SELLER when they take their first evidence photo, because they
 * must be able to write the code onto the parcel before they photograph it
 * leaving. Idempotent by construction: the code ends up handwritten on a
 * physical box, so a re-issue that returned a different string would invalidate
 * a parcel already in transit and strand a genuine delivery in a code mismatch.
 *
 * Deliberately NOT globally reserved, unlike Wave 1's paymentReferences and
 * Wave 2's orderRefs. Those two are uniqueness claims across all orders (one
 * CliQ transfer, one human-quotable ref). A delivery code is only ever compared
 * against its OWN order's stored code, so a collision between two unrelated
 * orders means nothing and a reservation collection would be dead weight.
 *
 * Written to deliveryCodes/{orderId}, which firestore.rules exposes to the
 * seller and admins only — never the buyer, who must learn it from the parcel.
 */
const { generateDeliveryCode, isValidDeliveryCode } = require('./deliveryCode');

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function issueDeliveryCode(deps, args = {}) {
  const {
    db,
    Timestamp,
    now = () => Date.now(),
    generate = generateDeliveryCode,
  } = deps;
  const { orderId, actorUid, isAdmin = false } = args;

  if (!orderId || typeof orderId !== 'string') {
    throw makeError('invalid-argument', 'orderId is required.');
  }

  return db.runTransaction(async (txn) => {
    // Reads before writes.
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await txn.get(orderRef);
    if (!orderSnap.exists) throw makeError('not-found', `Order ${orderId} not found.`);
    const o = orderSnap.data() || {};

    if (!isAdmin && o.sellerId !== actorUid) {
      throw makeError('permission-denied', 'Only the seller on this order may issue its delivery code.');
    }

    const codeRef = db.collection('deliveryCodes').doc(orderId);
    const codeSnap = await txn.get(codeRef);
    const existing = codeSnap.exists ? (codeSnap.data() || {}).code : undefined;
    // A stored value that is not a well-formed code is treated as absent: it can
    // never match what a buyer types, so handing it back would guarantee a
    // permanently unconfirmable order.
    if (isValidDeliveryCode(existing)) {
      return { code: existing, created: false };
    }

    const code = generate();
    txn.set(codeRef, {
      orderId,
      sellerId: o.sellerId,
      buyerId: o.buyerId,
      code,
      createdAt: Timestamp.fromMillis(now()),
    });
    return { code, created: true };
  });
}

module.exports = { issueDeliveryCode };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run functions/deliveryIssue.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Wire the callable**

In `functions/index.js`, next to the other core-module requires (`:23-24`):

```js
const { issueDeliveryCode: issueDeliveryCodeTxn } = require('./deliveryIssue');
```

Add the callable after `submitOrderPayment` (`:1932`):

```js
/**
 * issueDeliveryCode — Wave 3. The SELLER (or an admin acting for them) obtains
 * the code they must write on the parcel. Idempotent; ownership + state live in
 * deliveryIssue.js (unit-tested). This wrapper is auth-gating and admin
 * resolution only.
 */
exports.issueDeliveryCode = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'لا تملك صلاحية تنفيذ هذه العملية');
  }
  try {
    // Same admin resolution releaseOrderEscrow uses, so one definition of
    // "admin" governs every order-side callable.
    const callerSnap = await db.collection('users').doc(context.auth.uid).get();
    const cd = callerSnap.exists ? (callerSnap.data() || {}) : {};
    const isAdmin = cd.role === 'admin' || cd.isAdmin === true ||
      (context.auth.token.email || '').toLowerCase() === 'admaaqaba06@gmail.com';

    const deps = { db, Timestamp: admin.firestore.Timestamp, now: () => Date.now() };
    const result = await issueDeliveryCodeTxn(deps, {
      orderId: data && data.orderId,
      actorUid: context.auth.uid,
      isAdmin,
    });
    console.log(`[issueDeliveryCode] order=${data && data.orderId} created=${result.created}`);
    return { success: true, ...result };
  } catch (error) {
    console.error('Error in issueDeliveryCode:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    const code = ['not-found', 'permission-denied', 'failed-precondition', 'invalid-argument'].includes(error.code) ? error.code : 'internal';
    throw new functions.https.HttpsError(code, error.message || 'Operation failed.');
  }
});
```

- [ ] **Step 6: Verify the functions bundle still parses**

Run: `node --check functions/index.js && npx vitest run functions/`
Expected: no syntax error; all function tests pass

- [ ] **Step 7: Commit**

```bash
git add functions/deliveryIssue.js functions/deliveryIssue.test.js functions/index.js
git commit -m "feat(wave3): issueDeliveryCode callable (idempotent, seller/admin only)"
```

---

### Task 6: Step 3 — the code-gated escrow release

This is the money task. The buyer's confirmation is the completion event, so the code check must be authoritative inside the same transaction that moves funds, and guessing must be bounded.

**Files:**
- Create: `functions/deliveryConfirm.js`
- Create: `functions/deliveryConfirm.test.js`
- Modify: `functions/index.js:3058-3125` (releaseOrderEscrow preconditions), `:3237-3244` (order update), and the callable body for the attempt gate

**Interfaces:**
- Consumes: `isValidDeliveryCode`, `normalizeDeliveryCodeInput` (Task 1); `deliveryCodes/{orderId}` (Task 5).
- Produces: `checkDeliveryConfirm(deps, { orderId, buyerUid, typedCode, receivedPhotoUrl }) => Promise<{ matched: boolean, attempts: number, remaining: number }>`; `MAX_CODE_ATTEMPTS = 5`; `releaseOrderEscrow` accepts `action: 'buyer_confirm_receipt'` with `deliveryCode` and `receivedPhotoUrl`.

- [ ] **Step 1: Write the failing gate test**

Create `functions/deliveryConfirm.test.js` (same Firestore mock as Task 5):

```js
// Wave 3 — the buyer's code-attempt gate. A 5-character code from a 32-glyph
// alphabet is ~33.5M combinations, so guessing is not the practical threat —
// but an unbounded typed-code endpoint on a money-releasing action is, so
// attempts are counted and the counter is committed on FAILURE (a thrown
// transaction would roll it back and make the limit unenforceable).
import { describe, it, expect } from 'vitest';
import { checkDeliveryConfirm, MAX_CODE_ATTEMPTS } from './deliveryConfirm.js';

// ---- Firestore mock: copied from functions/orderPaymentSubmit.test.js -------
// (paste makeSnapshot / makeFakeDb / FakeTimestamp / deps here verbatim)

const READY_ORDER = {
  buyerId: 'b1',
  sellerId: 's1',
  status: 'out_for_delivery',
  sentPhotoUrl: 'https://x/sent.jpg',
};

const args = (over = {}) => ({
  orderId: 'o1',
  buyerUid: 'b1',
  typedCode: 'DC-7K3QP',
  receivedPhotoUrl: 'https://x/got.jpg',
  ...over,
});

describe('checkDeliveryConfirm', () => {
  it('matches the stored code and writes no attempt', async () => {
    const db = makeFakeDb({ 'orders/o1': READY_ORDER, 'deliveryCodes/o1': { code: 'DC-7K3QP' } });
    const res = await checkDeliveryConfirm(deps(db), args());
    expect(res.matched).toBe(true);
    expect(db._writes).toHaveLength(0);
  });

  it('accepts the code however the buyer types it', async () => {
    const db = makeFakeDb({ 'orders/o1': READY_ORDER, 'deliveryCodes/o1': { code: 'DC-7K3QP' } });
    const res = await checkDeliveryConfirm(deps(db), args({ typedCode: '  dc 7k3qp ' }));
    expect(res.matched).toBe(true);
  });

  it('records a failed attempt instead of throwing, so the limit can bite', async () => {
    const db = makeFakeDb({ 'orders/o1': READY_ORDER, 'deliveryCodes/o1': { code: 'DC-7K3QP' } });
    const res = await checkDeliveryConfirm(deps(db), args({ typedCode: 'DC-WRONG' }));
    expect(res.matched).toBe(false);
    expect(res.attempts).toBe(1);
    expect(res.remaining).toBe(MAX_CODE_ATTEMPTS - 1);
    const w = db._writes.find(x => x.path === 'orders/o1');
    expect(w.data.deliveryCodeAttempts).toBe(1);
  });

  it('locks out after MAX_CODE_ATTEMPTS', async () => {
    const db = makeFakeDb({
      'orders/o1': { ...READY_ORDER, deliveryCodeAttempts: MAX_CODE_ATTEMPTS },
      'deliveryCodes/o1': { code: 'DC-7K3QP' },
    });
    await expect(checkDeliveryConfirm(deps(db), args()))
      .rejects.toMatchObject({ code: 'resource-exhausted' });
  });

  it('refuses a caller who is not the buyer', async () => {
    const db = makeFakeDb({ 'orders/o1': READY_ORDER, 'deliveryCodes/o1': { code: 'DC-7K3QP' } });
    await expect(checkDeliveryConfirm(deps(db), args({ buyerUid: 's1' })))
      .rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses an order that is not out for delivery', async () => {
    const db = makeFakeDb({
      'orders/o1': { ...READY_ORDER, status: 'preparing_shipment' },
      'deliveryCodes/o1': { code: 'DC-7K3QP' },
    });
    await expect(checkDeliveryConfirm(deps(db), args()))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('refuses when the seller dispatch photo is missing — half a chain is no chain', async () => {
    const db = makeFakeDb({
      'orders/o1': { ...READY_ORDER, sentPhotoUrl: '' },
      'deliveryCodes/o1': { code: 'DC-7K3QP' },
    });
    await expect(checkDeliveryConfirm(deps(db), args()))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('refuses when no code was ever issued', async () => {
    const db = makeFakeDb({ 'orders/o1': READY_ORDER });
    await expect(checkDeliveryConfirm(deps(db), args()))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('requires an https receipt photo', async () => {
    const db = makeFakeDb({ 'orders/o1': READY_ORDER, 'deliveryCodes/o1': { code: 'DC-7K3QP' } });
    await expect(checkDeliveryConfirm(deps(db), args({ receivedPhotoUrl: '' })))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(checkDeliveryConfirm(deps(db), args({ receivedPhotoUrl: 'javascript:alert(1)' })))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run functions/deliveryConfirm.test.js`
Expected: FAIL — `Failed to load ./deliveryConfirm.js`

- [ ] **Step 3: Write the gate module**

Create `functions/deliveryConfirm.js`:

```js
/**
 * Wave 3 — the buyer's delivery-code attempt gate.
 *
 * This is the RATE LIMITER, not the authority. The authoritative code check
 * lives inside releaseOrderEscrow's money transaction (functions/index.js), so
 * a caller who somehow skipped this gate still cannot release funds on a wrong
 * code. This function exists because that transaction cannot count failures: a
 * mismatch there throws, the transaction rolls back, and the counter increment
 * rolls back with it — leaving an unbounded number of free guesses at a
 * money-releasing endpoint.
 *
 * So: on a mismatch this RETURNS `{ matched: false }` after committing the
 * increment, rather than throwing. The caller turns that into the user-facing
 * error. Do not "tidy" this into a throw — that re-opens the hole.
 */
const { isValidDeliveryCode, normalizeDeliveryCodeInput } = require('./deliveryCode');

const MAX_CODE_ATTEMPTS = 5;

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function isHttpsUrl(v) {
  return typeof v === 'string' && /^https:\/\/\S+$/i.test(v.trim());
}

async function checkDeliveryConfirm(deps, args = {}) {
  const { db, Timestamp, now = () => Date.now() } = deps;
  const { orderId, buyerUid, typedCode, receivedPhotoUrl } = args;

  if (!orderId || typeof orderId !== 'string') {
    throw makeError('invalid-argument', 'orderId is required.');
  }
  if (!isHttpsUrl(receivedPhotoUrl)) {
    throw makeError('invalid-argument', 'A photo of the item received is required.');
  }

  return db.runTransaction(async (txn) => {
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await txn.get(orderRef);
    if (!orderSnap.exists) throw makeError('not-found', `Order ${orderId} not found.`);
    const o = orderSnap.data() || {};

    if (o.buyerId !== buyerUid) {
      throw makeError('permission-denied', 'Only the buyer on this order may confirm receipt.');
    }
    if (o.status !== 'out_for_delivery') {
      throw makeError('failed-precondition', `Order ${orderId} is not out for delivery.`);
    }
    if (!o.sentPhotoUrl) {
      throw makeError('failed-precondition', 'The seller has not uploaded a dispatch photo for this order.');
    }

    const attempts = o.deliveryCodeAttempts || 0;
    if (attempts >= MAX_CODE_ATTEMPTS) {
      throw makeError('resource-exhausted', 'Too many delivery-code attempts on this order. Contact support.');
    }

    const codeSnap = await txn.get(db.collection('deliveryCodes').doc(orderId));
    const stored = codeSnap.exists ? (codeSnap.data() || {}).code : null;
    if (!isValidDeliveryCode(stored)) {
      throw makeError('failed-precondition', 'No delivery code has been issued for this order.');
    }

    if (normalizeDeliveryCodeInput(typedCode) !== stored) {
      const next = attempts + 1;
      txn.set(orderRef, {
        deliveryCodeAttempts: next,
        updatedAt: Timestamp.fromMillis(now()),
      }, { merge: true });
      return { matched: false, attempts: next, remaining: MAX_CODE_ATTEMPTS - next };
    }

    return { matched: true, attempts, remaining: MAX_CODE_ATTEMPTS - attempts };
  });
}

module.exports = { checkDeliveryConfirm, MAX_CODE_ATTEMPTS, isHttpsUrl };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run functions/deliveryConfirm.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Add the authoritative check inside the money transaction**

In `functions/index.js`, require the module alongside the others:

```js
const { checkDeliveryConfirm, MAX_CODE_ATTEMPTS, isHttpsUrl } = require('./deliveryConfirm');
```

In `exports.releaseOrderEscrow`, widen the destructure (`:3063`):

```js
  const { orderId, action, deliveryCode, receivedPhotoUrl } = data;
```

Immediately **before** `return await db.runTransaction(...)` (`:3070`), run the gate for the new action only:

```js
  // Wave 3 — the buyer's receipt confirmation. Two layers on purpose: this gate
  // counts wrong guesses (it can commit an increment, the money transaction
  // cannot — see deliveryConfirm.js), and the transaction below re-verifies the
  // code as the authority. Skipping straight to the transaction is safe but
  // unlimited; skipping the transaction check is not safe at all.
  if (action === 'buyer_confirm_receipt') {
    const gate = await checkDeliveryConfirm(
      { db, Timestamp: admin.firestore.Timestamp, now: () => Date.now() },
      { orderId, buyerUid: callerUserId, typedCode: deliveryCode, receivedPhotoUrl }
    );
    if (!gate.matched) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        `رمز التسليم غير مطابق. المحاولات المتبقية: ${gate.remaining}`
      );
    }
  }
```

Note this sits **outside** the `try` that maps errors to `'internal'`, so the gate's own `resource-exhausted` / `permission-denied` codes reach the client intact. If the existing `try` starts before this point, move the gate above it.

Inside the transaction, after the caller-authorization block and the idempotency check but **before any write** (i.e. after `:3125`), add:

```js
      // Wave 3 — authoritative preconditions for the buyer's receipt
      // confirmation. Re-read inside the transaction so nothing between the
      // gate and here can change the answer: the status could have moved, the
      // seller's dispatch photo could have been cleared, the code doc could
      // have been rewritten.
      if (action === 'buyer_confirm_receipt') {
        if (!isCallerBuyer) {
          throw new functions.https.HttpsError('permission-denied', 'Only the buyer may confirm receipt.');
        }
        if (orderData.status !== 'out_for_delivery') {
          throw new functions.https.HttpsError('failed-precondition', 'This order is not out for delivery.');
        }
        if (!orderData.sentPhotoUrl) {
          throw new functions.https.HttpsError('failed-precondition', 'The seller has not uploaded a dispatch photo.');
        }
        if (!isHttpsUrl(receivedPhotoUrl)) {
          throw new functions.https.HttpsError('invalid-argument', 'A photo of the item received is required.');
        }
        const codeSnap = await transaction.get(db.collection('deliveryCodes').doc(orderId));
        const storedCode = codeSnap.exists ? (codeSnap.data() || {}).code : null;
        if (!storedCode || normalizeDeliveryCodeInput(deliveryCode) !== storedCode) {
          throw new functions.https.HttpsError('invalid-argument', 'رمز التسليم غير مطابق.');
        }
      }
```

Add `normalizeDeliveryCodeInput` to the `deliveryCode` require at the top:

```js
const { normalizeDeliveryCodeInput } = require('./deliveryCode');
```

- [ ] **Step 6: Record the buyer's evidence on the order**

In the same function, extend the order update (`:3237-3244`) so the receipt photo and the delivery timestamp land in the SAME commit as the escrow release:

```js
      // 9. Update order status
      transaction.update(orderRef, {
        status: 'completed',
        escrowStatus: 'released',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        escrowReleasedAt: admin.firestore.FieldValue.serverTimestamp(),
        escrowReleasedBy: callerUserId,
        // Wave 3 — the buyer's half of the evidence chain, committed atomically
        // with the money it releases. Conditional spread: every other caller of
        // this function (admin release, force close, legacy buyer confirm) has
        // no receipt photo, and Firestore rejects an explicit `undefined`.
        ...(action === 'buyer_confirm_receipt' ? {
          receivedPhotoUrl: String(receivedPhotoUrl).trim(),
          deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
          deliveryConfirmedBy: callerUserId,
          deliveryCodeAttempts: 0,
        } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
```

- [ ] **Step 7: Verify the bundle parses and every function test still passes**

Run: `node --check functions/index.js && npx vitest run functions/`
Expected: no syntax error; all pass. `functions/txnPurity.test.js` guards that no FCM/notify send happens inside the transaction — if it fails, the new code was placed inside the transaction when it should be outside.

- [ ] **Step 8: Commit**

```bash
git add functions/deliveryConfirm.js functions/deliveryConfirm.test.js functions/index.js
git commit -m "feat(wave3): code-gated escrow release on buyer receipt confirmation"
```

---

### Task 7: Seller UI — steps 1 and 2

The seller must see exactly the one photo they owe. Per the repo's testing constraint, the step logic goes into a pure module so it is covered; only the JSX is verified by build + browser.

**Files:**
- Create: `src/utils/deliveryEvidence.ts`
- Create: `src/utils/deliveryEvidence.test.ts`
- Modify: `src/components/OrderDetailsView.tsx` — state near `:125-134`, handlers near `:561-601`, seller JSX at `:2061-2081`

**Interfaces:**
- Consumes: `executeOrderTransition` actions `'upload_prep_photo'` / `'mark_out_for_delivery'` (Task 3); `issueDeliveryCode` callable (Task 5).
- Produces: `deliveryStepFor(order, role) => 'seller_prep' | 'seller_dispatch' | 'buyer_confirm' | 'none'`; `uploadDeliveryPhoto(file, orderId, kind) => Promise<string>` (exported from `OrderDetailsView.tsx` is not needed — keep it a local helper inside the component).

- [ ] **Step 1: Write the failing test**

Create `src/utils/deliveryEvidence.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deliveryStepFor } from './deliveryEvidence';

const o = (status: string) => ({ status });

describe('deliveryStepFor', () => {
  it('gives the seller the prep photo once the money is in', () => {
    expect(deliveryStepFor(o('paid'), 'seller')).toBe('seller_prep');
  });

  it('gives the seller the dispatch photo while preparing', () => {
    expect(deliveryStepFor(o('preparing_shipment'), 'seller')).toBe('seller_dispatch');
  });

  it('gives the buyer the receipt step once it is out for delivery', () => {
    expect(deliveryStepFor(o('out_for_delivery'), 'buyer')).toBe('buyer_confirm');
  });

  it('never gives a party the other party step', () => {
    expect(deliveryStepFor(o('paid'), 'buyer')).toBe('none');
    expect(deliveryStepFor(o('preparing_shipment'), 'buyer')).toBe('none');
    expect(deliveryStepFor(o('out_for_delivery'), 'seller')).toBe('none');
  });

  it('offers nothing on legacy, terminal or disputed states', () => {
    for (const s of ['waiting_payment', 'shipped', 'delivered', 'completed', 'disputed', 'cancelled', 'refunded']) {
      expect(deliveryStepFor(o(s), 'seller')).toBe('none');
      expect(deliveryStepFor(o(s), 'buyer')).toBe('none');
    }
  });

  it('offers the admin nothing — the whole point is that they are not in the loop', () => {
    expect(deliveryStepFor(o('paid'), 'admin')).toBe('none');
    expect(deliveryStepFor(o('out_for_delivery'), 'admin')).toBe('none');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/deliveryEvidence.test.ts`
Expected: FAIL — cannot resolve `./deliveryEvidence`

- [ ] **Step 3: Write the module**

Create `src/utils/deliveryEvidence.ts`:

```ts
/**
 * Wave 3 — which delivery-evidence step, if any, the person looking at this
 * order owes right now. One function so the seller card and the buyer card can
 * never disagree about whose turn it is.
 *
 * `admin` deliberately gets 'none'. The admin team is not a step in this flow —
 * offloading the handoff to the counterparties is the entire point. The relay's
 * hand-advance (orderAdvance.ts) is their separate escape hatch.
 *
 * Legacy `shipped` gets 'none' too: those orders came from the phone-driven
 * relay with no code issued, so the buyer's existing "release payment" button
 * (unchanged) is their path, not a code they were never given.
 */
export type DeliveryStep = 'seller_prep' | 'seller_dispatch' | 'buyer_confirm' | 'none';

export function deliveryStepFor(
  order: { status?: string } | null | undefined,
  role: 'buyer' | 'seller' | 'admin',
): DeliveryStep {
  const status = order?.status;
  if (role === 'seller') {
    if (status === 'paid') return 'seller_prep';
    if (status === 'preparing_shipment') return 'seller_dispatch';
    return 'none';
  }
  if (role === 'buyer') {
    if (status === 'out_for_delivery') return 'buyer_confirm';
    return 'none';
  }
  return 'none';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/deliveryEvidence.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Add seller state, the code subscription and the upload helper**

In `src/components/OrderDetailsView.tsx`, add imports:

```ts
import { deliveryStepFor } from '../utils/deliveryEvidence';
import { isValidDeliveryCode, normalizeDeliveryCodeInput } from '../utils/deliveryCode';
```

Add state alongside the E6 block (`:125-134`):

```ts
  // Wave 3 — evidence-gated delivery.
  const [prepPhotoFile, setPrepPhotoFile] = useState<File | null>(null);
  const [sentPhotoFile, setSentPhotoFile] = useState<File | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<'hand' | 'courier'>('courier');
  const [deliveryCode, setDeliveryCode] = useState<string>('');
  const [deliveryCodeLoading, setDeliveryCodeLoading] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
```

Add the code loader after the existing seller-only effects (`:217`):

```ts
  // Wave 3 — the seller's delivery code. Lives in deliveryCodes/{orderId}, which
  // firestore.rules exposes to the seller and admins only; the buyer must learn
  // it from the parcel. Issued lazily and idempotently, so a seller who reaches
  // `preparing_shipment` through the admin relay (which issues nothing) still
  // gets one when they open the order.
  useEffect(() => {
    if (!order || !isSellerViewer) return;
    if (order.status !== 'preparing_shipment') return;
    if (deliveryCode) return;
    let cancelled = false;
    (async () => {
      setDeliveryCodeLoading(true);
      try {
        const issue = await getCallableFunction<{ orderId: string }, { success: boolean; code: string }>('issueDeliveryCode');
        const res = await issue({ orderId: order.id });
        if (!cancelled && res.data?.code) setDeliveryCode(res.data.code);
      } catch (err) {
        console.warn('Delivery code issue/lookup failed:', err);
      } finally {
        if (!cancelled) setDeliveryCodeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [order?.id, order?.status, isSellerViewer, deliveryCode]);
```

Add the upload helper next to `handleSubmitReturn` (it mirrors that function's Storage usage exactly):

```ts
  // Wave 3 — one upload path for all three evidence photos.
  // storage.rules gates `delivery-evidence/{orderId}/**` on any signed-in user,
  // image-only, ≤10MB; WHICH party may attach WHICH photo is enforced by
  // firestore.rules on the order write, not here.
  const uploadDeliveryPhoto = async (file: File, kind: 'prep' | 'sent' | 'received'): Promise<string> => {
    const { ref: storageRef, uploadBytes, getDownloadURL } = await import('firebase/storage');
    const { getFirebaseStorage } = await import('../services/firebase');
    const storageInstance = await getFirebaseStorage();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileRef = storageRef(storageInstance, `delivery-evidence/${order.id}/${kind}-${Date.now()}-${safeName}`);
    await uploadBytes(fileRef, file);
    return await getDownloadURL(fileRef);
  };
```

- [ ] **Step 6: Add the two seller handlers**

Next to `handlePrepareShipment` (`:561`):

```ts
  // Wave 3 step 1 — the seller photographs the item being prepared. Replaces the
  // bare "Begin Preparing Shipment" click: the photo IS the transition.
  const handleUploadPrepPhoto = async () => {
    if (!prepPhotoFile) {
      alert(isAr ? 'أرفق صورة للمنتج أثناء التجهيز.' : 'Attach a photo of the item being prepared.');
      return;
    }
    setUploadingEvidence(true);
    try {
      const url = await uploadDeliveryPhoto(prepPhotoFile, 'prep');
      await executeOrderTransition(order, 'upload_prep_photo', currentUser, { prepPhotoUrl: url });
      setPrepPhotoFile(null);
      showToast({
        type: 'success',
        title: isAr ? 'تم تسجيل بدء التجهيز' : 'Preparation recorded',
      });
    } catch (err: any) {
      console.error(err);
      alert(isAr ? `تعذر رفع الصورة: ${err.message}` : `Could not upload the photo: ${err.message}`);
    } finally {
      setUploadingEvidence(false);
    }
  };

  // Wave 3 step 2 — the seller photographs it leaving WITH the delivery code
  // visible. The buyer's photo must show the same code; that match is the proof.
  const handleMarkOutForDelivery = async () => {
    if (!sentPhotoFile) {
      alert(isAr ? 'أرفق صورة للمنتج عند الإرسال مع ظهور رمز التسليم.' : 'Attach a photo of the item sent, with the delivery code visible.');
      return;
    }
    setUploadingEvidence(true);
    try {
      const url = await uploadDeliveryPhoto(sentPhotoFile, 'sent');
      await executeOrderTransition(order, 'mark_out_for_delivery', currentUser, {
        sentPhotoUrl: url,
        deliveryMethod,
      });
      setSentPhotoFile(null);
      showToast({
        type: 'success',
        title: isAr ? 'تم تسجيل خروج الطلب للتوصيل' : 'Marked out for delivery',
      });
    } catch (err: any) {
      console.error(err);
      alert(isAr ? `تعذر تحديث الحالة: ${err.message}` : `Could not update the order: ${err.message}`);
    } finally {
      setUploadingEvidence(false);
    }
  };
```

- [ ] **Step 7: Replace the seller's two buttons with the evidence cards**

At `src/components/OrderDetailsView.tsx:2061-2081`, replace the `order.status === 'paid'` and `order.status === 'preparing_shipment'` blocks. Use the file's existing card idiom (`border border-gray-200 rounded-2xl p-4 bg-[#FAF9F6] space-y-4`, `text-[10px] font-bold uppercase font-mono` labels, `#FF6B00` primary buttons):

```tsx
                  {/* Wave 3 step 1 — photo of the item being prepared */}
                  {deliveryStepFor(order, 'seller') === 'seller_prep' && (
                    <div className="border border-gray-200 rounded-2xl p-4 bg-[#FAF9F6] space-y-3">
                      <h4 className="text-xs font-black uppercase font-mono text-gray-900">
                        {isAr ? '١ · صوّر المنتج أثناء التجهيز' : '1 · Photograph the item being prepared'}
                      </h4>
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        {isAr
                          ? 'صورة واحدة تثبت أن المنتج بحوزتك وجاهز للإرسال. بعدها نعطيك رمز التسليم.'
                          : 'One photo showing the item is with you and ready to send. We issue your delivery code next.'}
                      </p>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setPrepPhotoFile(e.target.files?.[0] || null)}
                        className="w-full text-[11px] file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-gray-900 file:text-white file:text-[10px] file:font-mono file:uppercase"
                      />
                      <button
                        onClick={handleUploadPrepPhoto}
                        disabled={uploadingEvidence || !prepPhotoFile}
                        className="w-full bg-[#FF6B00] hover:bg-[#FF8000] text-white font-black py-3.5 rounded-2xl text-xs transition-all tracking-wider shadow-md shadow-orange-500/10 flex items-center justify-center gap-2 cursor-pointer uppercase font-mono active:scale-[0.99] disabled:opacity-50"
                      >
                        <Package className="w-4 h-4" />
                        <span>{uploadingEvidence ? (isAr ? 'جارٍ الرفع…' : 'Uploading…') : (isAr ? 'رفع صورة التجهيز' : 'Upload preparation photo')}</span>
                      </button>
                    </div>
                  )}

                  {/* Wave 3 step 2 — dispatch photo with the delivery code visible */}
                  {deliveryStepFor(order, 'seller') === 'seller_dispatch' && (
                    <div className="border border-gray-200 rounded-2xl p-4 bg-[#FAF9F6] space-y-3">
                      <h4 className="text-xs font-black uppercase font-mono text-gray-900">
                        {isAr ? '٢ · أرسل المنتج وصوّره مع رمز التسليم' : '2 · Send it and photograph it with the delivery code'}
                      </h4>

                      <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-1">
                        <p className="text-[10px] font-bold uppercase font-mono text-gray-500">
                          {isAr ? 'رمز التسليم' : 'Delivery code'}
                        </p>
                        <p className="text-2xl font-black font-mono tracking-widest text-gray-900" dir="ltr">
                          {deliveryCodeLoading ? '…' : (deliveryCode || '—')}
                        </p>
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                          {isAr
                            ? 'اكتب هذا الرمز على الطرد بخط واضح. يجب أن يظهر في صورتك وفي صورة المشتري عند الاستلام — التطابق هو ما يحرّر مبلغك.'
                            : 'Write this code clearly on the parcel. It must be visible in your photo and in the buyer’s receipt photo — that match is what releases your money.'}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase font-mono text-gray-500">
                          {isAr ? 'طريقة التوصيل' : 'Delivery method'}
                        </p>
                        {([
                          { value: 'courier' as const, ar: 'مندوب توصيل', en: 'Local courier' },
                          { value: 'hand' as const, ar: 'تسليم باليد', en: 'Hand delivery' },
                        ]).map(opt => (
                          <label
                            key={opt.value}
                            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${deliveryMethod === opt.value ? 'border-[#FF6B00] bg-orange-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                          >
                            <input
                              type="radio"
                              name="delivery-method"
                              checked={deliveryMethod === opt.value}
                              onChange={() => setDeliveryMethod(opt.value)}
                              className="accent-[#FF6B00]"
                            />
                            <span className="text-xs font-bold text-gray-800">{isAr ? opt.ar : opt.en}</span>
                          </label>
                        ))}
                      </div>

                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setSentPhotoFile(e.target.files?.[0] || null)}
                        className="w-full text-[11px] file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-gray-900 file:text-white file:text-[10px] file:font-mono file:uppercase"
                      />
                      <button
                        onClick={handleMarkOutForDelivery}
                        disabled={uploadingEvidence || !sentPhotoFile}
                        className="w-full bg-[#121318] hover:bg-gray-900 text-white font-black py-3.5 rounded-2xl text-xs transition-all tracking-wider flex items-center justify-center gap-2 cursor-pointer uppercase font-mono active:scale-[0.99] disabled:opacity-50"
                      >
                        <Truck className="w-4 h-4" />
                        <span>{uploadingEvidence ? (isAr ? 'جارٍ الرفع…' : 'Uploading…') : (isAr ? 'خرج للتوصيل' : 'Mark out for delivery')}</span>
                      </button>
                    </div>
                  )}

                  {/* Wave 3 — waiting on the buyer's half of the chain */}
                  {order.status === 'out_for_delivery' && (
                    <div className="bg-amber-50/50 border border-amber-200/50 p-3.5 rounded-2xl text-center">
                      <p className="text-xs font-bold text-amber-700 flex items-center justify-center gap-1.5">
                        <Clock className="w-4 h-4 animate-pulse" />
                        <span>{isAr ? 'بانتظار تأكيد المشتري للاستلام — عندها يُحرَّر مبلغك.' : 'Awaiting the buyer’s receipt confirmation — that releases your funds.'}</span>
                      </p>
                    </div>
                  )}
```

The legacy `handlePrepareShipment` / `handleMarkAsShipped` handlers stay in the file: the admin relay still calls the same actions via `FulfillmentSection`. Only the seller's own buttons are replaced.

- [ ] **Step 8: Verify it builds**

Run: `npm run build`
Expected: build succeeds. (`npm run lint` is `tsc --noEmit` and has pre-existing errors in this repo — it is not a gate. Read `docs/` or run it only to compare against the pre-change error list.)

- [ ] **Step 9: Commit**

```bash
git add src/utils/deliveryEvidence.ts src/utils/deliveryEvidence.test.ts src/components/OrderDetailsView.tsx
git commit -m "feat(wave3): seller evidence steps — prep photo, delivery code, dispatch photo"
```

---

### Task 8: Buyer UI — step 3 and the problem path

The buyer's confirmation is the money event, so this card must make the code requirement obvious and must offer the dispute path as a real alternative rather than a dead end.

**Files:**
- Modify: `src/components/OrderDetailsView.tsx` — buyer state, handler near `:603`, buyer JSX near `:1687`
- Modify: `functions/returns.js:29-33` (`canRequestReturn`)
- Test: `functions/returns.test.js`

**Interfaces:**
- Consumes: `deliveryStepFor` (Task 7); `executeOrderTransition(order, 'confirm_receipt', user, { deliveryCode, receivedPhotoUrl })` (Task 3); `releaseOrderEscrow` action `buyer_confirm_receipt` (Task 6).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Write the failing returns test**

Append to `functions/returns.test.js`:

```js
describe('Wave 3 — the dispute gate is reachable from out_for_delivery', () => {
  it('allows a claim while the item is out for delivery', () => {
    expect(canRequestReturn({ status: 'out_for_delivery' })).toBe(true);
  });

  it('still allows the legacy shipped path', () => {
    expect(canRequestReturn({ status: 'shipped' })).toBe(true);
  });

  it('still refuses states with nothing to claim against', () => {
    expect(canRequestReturn({ status: 'paid' })).toBe(false);
    expect(canRequestReturn({ status: 'completed' })).toBe(false);
    expect(canRequestReturn({ status: 'preparing_shipment' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run functions/returns.test.js`
Expected: FAIL — `canRequestReturn({ status: 'out_for_delivery' })` returns `false`

- [ ] **Step 3: Open the dispute gate**

In `functions/returns.js`, replace the status check in `canRequestReturn`:

```js
// Wave 3 — `out_for_delivery` joins `shipped` here. Under the evidence flow the
// buyer's ONLY alternative to confirming receipt is opening a claim, so if this
// status could not raise one, a buyer holding a damaged item would have no path
// at all except confirming — which pays the seller.
const CLAIMABLE_STATUSES = ['shipped', 'out_for_delivery'];

function canRequestReturn(order) {
  if (!order || !CLAIMABLE_STATUSES.includes(order.status)) return false;
```

Keep the remaining lines of the function unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run functions/returns.test.js`
Expected: PASS

- [ ] **Step 5: Add buyer state and the confirm handler**

In `src/components/OrderDetailsView.tsx`, add state next to the Wave 3 seller state from Task 7:

```ts
  const [receivedPhotoFile, setReceivedPhotoFile] = useState<File | null>(null);
  const [typedDeliveryCode, setTypedDeliveryCode] = useState<string>('');
  const [deliveryCodeError, setDeliveryCodeError] = useState<string>('');
```

Add the handler next to `handleConfirmDelivery` (`:603`):

```ts
  // Wave 3 step 3 — the buyer's receipt photo (delivery code visible) plus the
  // typed code. This is the completion event: the callable verifies the code
  // inside the money transaction and releases escrow in the same commit.
  const handleConfirmReceipt = async () => {
    const normalized = normalizeDeliveryCodeInput(typedDeliveryCode);
    if (!isValidDeliveryCode(normalized)) {
      setDeliveryCodeError(isAr
        ? 'أدخل رمز التسليم المكتوب على الطرد (مثال: DC-7K3QP).'
        : 'Enter the delivery code written on the parcel (e.g. DC-7K3QP).');
      return;
    }
    setDeliveryCodeError('');
    if (!receivedPhotoFile) {
      alert(isAr ? 'أرفق صورة للمنتج عند الاستلام مع ظهور رمز التسليم.' : 'Attach a photo of the item received, with the delivery code visible.');
      return;
    }
    if (!confirm(isAr
      ? 'بتأكيد الاستلام يتم تحرير المبلغ للبائع نهائياً. هل استلمت المنتج وعاينته؟'
      : 'Confirming receipt releases the payment to the seller for good. Have you received and inspected the item?')) {
      return;
    }
    setUploadingEvidence(true);
    try {
      const url = await uploadDeliveryPhoto(receivedPhotoFile, 'received');
      const result = await executeOrderTransition(order, 'confirm_receipt', currentUser, {
        receivedPhotoUrl: url,
        deliveryCode: normalized,
      });
      setReceivedPhotoFile(null);
      setTypedDeliveryCode('');
      if (result && result.alreadyReleased) {
        alert(isAr ? 'تم تحرير هذا المبلغ سابقاً' : 'This amount was already released.');
      } else {
        alert(isAr ? 'تم تأكيد الاستلام وتحويل المبلغ للبائع.' : 'Receipt confirmed — funds transferred to the seller.');
      }
    } catch (err: any) {
      console.error(err);
      // The callable answers a wrong code with invalid-argument and a remaining
      // count in the message; show it inline on the field rather than in an
      // alert, so the buyer can correct it without losing the attached photo.
      if (err?.code === 'functions/invalid-argument') {
        setDeliveryCodeError(err.message);
      } else if (err?.code === 'functions/resource-exhausted') {
        setDeliveryCodeError(isAr
          ? 'تجاوزت عدد المحاولات المسموح بها. تواصل مع الدعم.'
          : "You've used all delivery-code attempts — please contact support.");
      } else {
        alert(isAr ? `تعذر تأكيد الاستلام: ${err.message}` : `Could not confirm receipt: ${err.message}`);
      }
    } finally {
      setUploadingEvidence(false);
    }
  };
```

- [ ] **Step 6: Add the buyer card**

In the buyer branch, immediately **before** the existing `{(order.status === 'shipped' || order.status === 'delivered') && (` block at `:1687` (which stays untouched for legacy orders):

```tsx
                  {/* Wave 3 step 3 — receipt evidence + typed code. This is the
                      completion event; there is no timer and no auto-complete. */}
                  {deliveryStepFor(order, 'buyer') === 'buyer_confirm' && (
                    <div className="space-y-2.5">
                      <div className="border border-gray-200 rounded-2xl p-4 bg-[#FAF9F6] space-y-3">
                        <h4 className="text-xs font-black uppercase font-mono text-gray-900">
                          {isAr ? '٣ · أكّد استلامك' : '3 · Confirm you received it'}
                        </h4>
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                          {isAr
                            ? 'صوّر المنتج بعد الاستلام مع ظهور رمز التسليم المكتوب على الطرد، وأدخل الرمز نفسه. التأكيد يحرّر المبلغ للبائع نهائياً.'
                            : 'Photograph the item after receiving it with the delivery code on the parcel visible, then type that same code. Confirming releases the payment to the seller for good.'}
                        </p>

                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setReceivedPhotoFile(e.target.files?.[0] || null)}
                          className="w-full text-[11px] file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-gray-900 file:text-white file:text-[10px] file:font-mono file:uppercase"
                        />

                        <div className="space-y-1.5">
                          <p className="text-[10px] font-bold uppercase font-mono text-gray-500">
                            {isAr ? 'رمز التسليم المكتوب على الطرد' : 'Delivery code on the parcel'}
                          </p>
                          <input
                            type="text"
                            dir="ltr"
                            inputMode="text"
                            autoCapitalize="characters"
                            value={typedDeliveryCode}
                            onChange={(e) => { setTypedDeliveryCode(e.target.value); if (deliveryCodeError) setDeliveryCodeError(''); }}
                            placeholder="DC-7K3QP"
                            className={`w-full bg-white border rounded-xl px-3 py-2.5 text-sm font-mono tracking-widest text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-[#FF6B00] transition-colors ${deliveryCodeError ? 'border-red-300' : 'border-gray-200'}`}
                          />
                          {deliveryCodeError && (
                            <p className="text-[10px] text-red-500 font-bold leading-snug">{deliveryCodeError}</p>
                          )}
                        </div>

                        <button
                          onClick={handleConfirmReceipt}
                          disabled={uploadingEvidence || submittingReturn || !receivedPhotoFile || !typedDeliveryCode.trim()}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 rounded-2xl text-xs transition-all tracking-wider shadow-md shadow-emerald-500/10 flex items-center justify-center gap-2 cursor-pointer uppercase font-mono active:scale-[0.99] disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{uploadingEvidence ? (isAr ? 'جارٍ التأكيد…' : 'Confirming…') : (isAr ? 'أكّد الاستلام وحرّر الدفعة' : 'Confirm receipt & release payment')}</span>
                        </button>
                      </div>

                      {!showReturnForm && (
                        <button
                          onClick={() => setShowReturnForm(true)}
                          disabled={uploadingEvidence || submittingReturn}
                          className="w-full bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 font-bold py-3 rounded-2xl text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer uppercase font-mono disabled:opacity-50"
                        >
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                          <span>{isAr ? 'وصل تالفاً أو مخالفاً للوصف' : 'Arrived damaged or not as described'}</span>
                        </button>
                      )}
                    </div>
                  )}
```

- [ ] **Step 7: Let the return form open from the new status**

The return-claim form JSX at `:1727` currently renders inside the `order.status === 'shipped'` guard at `:1713`. Move the form so it renders whenever `showReturnForm` is true and the status is `shipped` **or** `out_for_delivery` — the server gate (`canRequestReturn`, Step 3) now accepts both, so the comment at `:1699-1712` about burning uploads on a call that can only fail no longer applies to `out_for_delivery`. Update that comment to say so; leave the `delivered` exclusion and its reasoning intact.

- [ ] **Step 8: Verify build and full suite**

Run: `npm run build && npx vitest run`
Expected: build succeeds, all tests pass

- [ ] **Step 9: Commit**

```bash
git add src/components/OrderDetailsView.tsx functions/returns.js functions/returns.test.js
git commit -m "feat(wave3): buyer receipt confirmation with typed code + dispute path from out_for_delivery"
```

---

### Task 9: Every other surface that enumerates order statuses

A new status that half the app has never heard of shows up as a missing row, a wrong count or a silently dropped order. This task closes those.

**Files:**
- Modify: `functions/index.js:1159-1165` (`onOrderStatusChanged` NOTIFY map)
- Modify: `src/components/admin/OrdersLedgerSection.tsx:30` (union), `:95` (filter list), `:99-112` (labels)
- Modify: `src/components/SellerCenterView.tsx:551`, `:1006-1007`, `:1560`
- Modify: `src/components/ProfileView.tsx:29`
- Modify: `src/components/SellerProfileModal.tsx:88`

**Interfaces:**
- Consumes: `'out_for_delivery'` (Task 2).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Map the status onto the existing WhatsApp event**

In `functions/index.js`, add to the `NOTIFY` map in `onOrderStatusChanged`:

```js
      // Wave 3 — reuses the EXISTING order_shipped event on purpose. The n8n
      // workflow (v2, live) has a fixed 21-event contract and notify.js's
      // CHANNEL_POLICY mirrors it; a new key here would emit an event n8n does
      // not route, and the buyer would silently get nothing. "Out for delivery"
      // is what order_shipped already means to a buyer.
      out_for_delivery: 'order_shipped',
```

- [ ] **Step 2: Add the status to the admin ledger filter**

In `src/components/admin/OrdersLedgerSection.tsx`, add `| 'out_for_delivery'` to the filter union at `:30`, add `'out_for_delivery'` to the filter array at `:95` (between `'preparing_shipment'` and `'shipped'`), and add the two label branches alongside the existing `shipped` ones:

```tsx
               filterOpt === 'out_for_delivery' ? 'خرج للتوصيل' :
```
```tsx
               filterOpt === 'out_for_delivery' ? 'OUT FOR DELIVERY' :
```

- [ ] **Step 3: Add the status to the seller centre lists**

In `src/components/SellerCenterView.tsx`:
- `:551` — add `'out_for_delivery'` to the pending-orders status array.
- `:1006-1007` — the `'shipped'` filter case becomes `o.status === 'shipped' || o.status === 'out_for_delivery' || o.status === 'delivered'`.
- `:1560` — the same predicate for the tab's count, so the badge matches the list it opens.

- [ ] **Step 4: Add the status to the two "followed through" tallies**

In `src/components/ProfileView.tsx:29`, add `'out_for_delivery'` to `WON_ORDER_STATUSES` (between `'preparing_shipment'` and `'shipped'`).

In `src/components/SellerProfileModal.tsx:88`, add `|| o.status === 'out_for_delivery'` to the `deliveredCount` predicate.

- [ ] **Step 5: Sweep for anything missed**

Run: `grep -rn "'preparing_shipment'" src functions --include="*.ts" --include="*.tsx" --include="*.js" | grep -v node_modules | grep -v "\.test\."`

Every hit that enumerates statuses (rather than testing for that one status) must also handle `out_for_delivery`, unless there is a stated reason not to. Note in the commit message any hit deliberately left alone and why.

- [ ] **Step 6: Verify**

Run: `npm run build && npx vitest run`
Expected: build succeeds, all tests pass

- [ ] **Step 7: Commit**

```bash
git add functions/index.js src/components/admin/OrdersLedgerSection.tsx src/components/SellerCenterView.tsx src/components/ProfileView.tsx src/components/SellerProfileModal.tsx
git commit -m "feat(wave3): surface out_for_delivery in ledger, seller centre, tallies and notify map"
```

---

### Task 10: Documentation and whole-branch verification

**Files:**
- Modify: `docs/admin-seller-audit-2026-07.md` (Wave 3 status)
- Modify: `docs/BACKLOG.md`
- Modify: `docs/superpowers/specs/2026-07-28-wave3-delivery-evidence-design.md` (record the field-level-denylist correction)

- [ ] **Step 1: Record the spec correction**

In the design spec, under "Resolved decisions", amend point 3 to state what was actually built: the code lives in `deliveryCodes/{orderId}` because Firestore has no field-level read denylist and the buyer can read the whole order document. Leave the rest of the spec as written — it is the locked record of the decision, and this is a correction of mechanism, not of intent.

- [ ] **Step 2: Update the audit roadmap and backlog**

In `docs/admin-seller-audit-2026-07.md`, mark Wave 3 as shipped and list what landed: the new status, the evidence fields, the code store, the two callable changes, the rules gates.

In `docs/BACKLOG.md`, note under the queued projects that the delivery handoff is now in-app, and that the paper receipt is an offline fallback rather than the system of record.

- [ ] **Step 3: Full verification**

Run each and paste the real output into the PR body — do not summarise from memory:

```bash
npx vitest run
npm run build
node --check functions/index.js
firebase deploy --only firestore:rules,storage --project mazadjoapp --dry-run
```

Expected: test count is at least the pre-branch count plus roughly 35 new tests; build succeeds; rules compile.

- [ ] **Step 4: Commit and open the PR**

```bash
git add docs/
git commit -m "docs(wave3): record the evidence-delivery flow + the deliveryCodes correction"
```

PR body must include: the four verification outputs above, the rules verdict table from Task 4 Step 6 (with its control run), and the manual smoke-test checklist below.

- [ ] **Step 5: Manual smoke test on the preview deploy (MJ)**

Firebase auth is per-origin, so the Vercel preview needs its own login — the prod session does not carry over. On a phone and on desktop, in both languages:

1. Seller on a `paid` order: upload a prep photo → status becomes "قيد التجهيز للشحن", delivery code appears.
2. Reload the order → the **same** code appears (idempotency).
3. Seller: pick "مندوب توصيل", upload the dispatch photo → status becomes "خرج للتوصيل".
4. Buyer on that order: the code field is nowhere in the UI, and the order document read in the browser console contains no code.
5. Buyer types a **wrong** code → inline error naming the remaining attempts; the attached photo is not lost.
6. Buyer types the correct code with the receipt photo → order completes, seller wallet credited, both parties notified.
7. Confirm a second time → "تم تحرير هذا المبلغ سابقاً", no double payout.
8. A different order at `out_for_delivery`: buyer opens "وصل تالفاً" instead → the return claim submits.
9. Legacy check: an order sitting at `shipped` still shows the old "release payment" button and still releases.

**Do not merge before step 5 passes** — this branch changes a money path and deploys `firestore.rules` to production.

---

## Self-Review

**Spec coverage**

| Spec requirement | Task |
|---|---|
| Step 1 — seller prep photo → `preparing_shipment` | 3, 7 |
| Step 2 — seller sent photo with code → `out_for_delivery` (new status) | 2, 3, 7 |
| Step 3 — buyer received photo + typed code → delivered/completed, escrow releases | 3, 6, 8 |
| Code is the thread; same code out and in | 1, 5, 6 |
| Self-service UI mandatory for both parties | 7, 8 |
| Delivery methods hand + courier only | 3, 7 |
| Final sale on delivery; no timer, no auto-complete cron | 6 (no scheduler anywhere in the plan) |
| Dispute gate as the only recourse | 8 |
| Ratings compound | already live (E7); completion at step 3 makes the order rateable via the existing `canRateOrder` on `completed` |
| Decision 1 — photo **and** typed code | 6, 8 |
| Decision 2 — escrow release through a server callable, atomic + idempotent | 6 |
| Decision 3 — code hidden from the buyer | 4 (mechanism corrected: separate document, not a field denylist) |
| Decision 4 — steps 1–2 client transitions gated on the photo; money server-side | 3, 4, 6 |
| Glossary + counters + audit-log viewer reflect new statuses | 2, 9 |

**Notes for the implementer**

- Task 6 is the only task that touches a live money transaction. It is deliberately additive: no existing branch of `releaseOrderEscrow` changes behaviour, and every new write is behind `action === 'buyer_confirm_receipt'`.
- Tasks 1, 2, 5 have no dependency on each other and can be done in any order. Task 3 needs Task 2; Task 6 needs Tasks 1 and 5; Tasks 7 and 8 need Task 3.
- The `functions/*.test.js` files use a hand-rolled Firestore mock that is copied per-file rather than shared. That is the house pattern here — copy it, do not extract it into a helper as part of this work.
