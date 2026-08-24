# Wave 4 — Admin Action Center (Design Spec)

**Date:** 2026-07-28 · **Status:** LOCKED with MJ. Final wave of the admin/seller/order-flow audit — see `docs/admin-seller-audit-2026-07.md` (items B1/B3) and shipped Waves 0–3.

## Why this wave exists (the WHY — do not lose this)

The audit called this "Action Center consolidation" and implied the problem was tab-hopping. It isn't. MJ's actual complaint, 2026-07-28:

> "each tab is confusing, there's a lot of information on each tab. and some tabs irrelevant now like fulfillment… verify and approve are confusing bc its both for memberships and orders… launch is also confusing bc its mazzado launches but also approving customer mazads."

The panel's shape no longer matches what the system does, and three tabs each quietly do two unrelated jobs:

- **Fulfillment** was built as the phone relay — call the seller, hand-advance the order. **Wave 3 made that self-service**, so its bucket structure now describes work the admin no longer performs. The tab is still needed; its premise is not.
- **Verify & Approve** sums two unrelated money flows. Literally: `AdminDashboardView.tsx:756` reads `pendingVerify: subscriptionRequests.length + pendingOrderPaymentsCount` — membership subscriptions and marketplace escrow in one number. Hence the pile of near-identical empty states.
- **Launch** mixes Mazad-as-operator (our own drops) with Mazad-as-referee (approving customer lots).

So this is not "merge five tabs into one queue". It is **re-cutting the panel along seams that actually exist**.

## The model (LOCKED)

**Exceptions + reference.** One queue holds everything that needs a human. Everything else becomes a quiet reference tab visited deliberately.

Post-Wave-3 the panel should be **nearly empty on a healthy day**. A row appearing means the self-service flow did not complete. That emptiness is the product, not a bug.

### Surfaces

| Today | Becomes |
|---|---|
| `home` | **Action Center** — the queue. Default tab. |
| `launch` | **Our drops** — Mazad's own inventory only: build, schedule, go live. Customer approvals leave. |
| `verify`, `fulfillment`, `disputes`, `payouts` | **Removed as tabs.** Their work becomes queue rows; their per-item cards become row bodies. |
| `orders`, `members`, `auction-lookup`, `audit`, `system` | Unchanged reference tabs. |

Legacy tab ids redirect to the Action Center via the `LEGACY_TAB_MAP` already in `src/utils/adminNav.ts`. No bookmark breaks.

`computeAttentionCounts` is **deleted**. Queue length becomes the single source of "how much is waiting" — today's counts and the queue could otherwise disagree.

### What earns a row (all four confirmed by MJ)

1. **Money waiting on a human** — order CliQ receipt to verify, membership payment to verify, payout to approve.
2. **Customer lot awaiting approval** — now doubly important: approval is what grants the seller's account (`onListingApproved`, PR #188).
3. **Delivery stalled** — the Wave 3 chain did not complete.
4. **Trouble** — disputes and return claims. The one path Wave 3 deliberately routes to a human.

## The row

```ts
export type ActionKind =
  | 'verify_order_payment'
  | 'verify_membership'
  | 'approve_listing'
  | 'payout'
  | 'delivery_stalled'
  | 'dispute';

export type ActionReason =
  | 'receipt_to_verify'        // buyer submitted a CliQ receipt
  | 'membership_to_verify'     // subscription request pending
  | 'lot_awaiting_review'      // customer lot submitted
  | 'payout_to_approve'        // withdrawal pending_review
  | 'seller_hasnt_prepped'     // payment verified, no prep photo past SLA
  | 'buyer_hasnt_confirmed'    // out_for_delivery past SLA
  | 'code_attempts_exhausted'  // buyer locked out at 5/5 — cannot self-serve
  | 'dispute_open'
  | 'return_claim';

export interface ActionRow {
  /** Stable across rebuilds: `${kind}:${entityId}`. Drives React keys and expand state. */
  id: string;
  kind: ActionKind;
  entityId: string;            // order id / auction id / request id / withdrawal id
  reason: ActionReason;
  /** Epoch ms the item started waiting. Renders as an age, never a raw date. */
  waitingSinceMs: number;
  severity: 'blocking' | 'aging' | 'new';
  /** Money at stake, when there is any. Fils, matching the rest of the codebase. */
  amountFils?: number;
  /** For display only — the builder never renders. */
  label: { ar: string; en: string };
}
```

A row reads **"buyer hasn't confirmed receipt · 6 days · 972 JOD"**. Today's home screen shows how *many*, never how *urgent*; that is the gap this closes.

**Severity:** `blocking` = someone is stuck and cannot proceed unaided. `aging` = past its SLA. `new` = waiting, within SLA.

Every reason needs an explicit SLA, or "aging" is undefined for it:

| reason | severity rule |
|---|---|
| `code_attempts_exhausted`, `dispute_open`, `return_claim` | always `blocking` — the counterparty cannot proceed without a human, regardless of age |
| `seller_hasnt_prepped` | `aging` past **24h** from payment verification, else `new` |
| `buyer_hasnt_confirmed` | `aging` past **24h** from `out_for_delivery`, else `new` |
| `receipt_to_verify`, `membership_to_verify`, `payout_to_approve` | `aging` past **24h** from submission, else `new` — someone is waiting on their money either way |
| `lot_awaiting_review` | `aging` past **24h** from submission, else `new` — a seller waiting on approval is a seller not selling |

24h everywhere is deliberate: one number for the whole operation, matching the shipping and delivery SLAs. Nobody should have to remember which queue has which clock.

**Ordering:** severity (blocking → aging → new), then oldest `waitingSinceMs` first, then larger `amountFils` first. Deterministic — no ties left to array order.

## SLAs

MJ, 2026-07-28: *"shipment has to happen asap within 24 hrs after payment is made… which means delivery bc its basically all in amman or surrounding areas."*

`THRESHOLDS` in `src/utils/fulfillmentQueues.ts`:

| bucket | today | becomes |
|---|---|---|
| `awaiting_shipment` | 48h | **24h** |
| `awaiting_delivery` | 5 days | **24h** |
| `awaiting_release` | 24h | 24h (unchanged — legacy `delivered` orders only) |

**Blast radius is client-only.** `functions/fulfillmentNudge.js` re-implements `bucketOrder` but reads no thresholds — it derives the bucket, not overdue-ness. Verified 2026-07-28. So this changes the admin view and the queue, and nothing server-side.

**Expect a non-empty queue on day one.** Going from five days to one will surface orders that have been drifting quietly. That is the intent, but it will look alarming at first and should not be mistaken for a bug.

## Architecture

**`src/utils/actionQueue.ts` — pure, no Firestore.**

```ts
export interface ActionQueueInput {
  orders: Order[];
  pendingListings: { id: string; createdAt: unknown; title?: string }[];
  subscriptionRequests: { id: string; userId: string; createdAt: unknown }[];
  withdrawals: { id: string; userId: string; status: string; timestamp: unknown }[];
  disputes: { id: string; orderId: string; status: string; createdAt: unknown }[];
}

export function buildActionQueue(input: ActionQueueInput, nowMs: number): ActionRow[];
```

All ranking, SLA evaluation and reason derivation live here. This is the house pattern and it matters more than usual: vitest is node-only with no jsdom, so logic left in JSX ships untested (see `reference_mazzado_testing`). Anything the queue *decides* belongs in this file; the component only renders.

**Components**

- `src/components/admin/ActionCenterSection.tsx` — renders the list, owns expand/collapse, delegates each expanded row to its card. No business logic.
- Row bodies, extracted from the dissolving sections:
  - `PaymentVerifyCard` — **already standalone**; reuse as-is. It is the pattern for the rest.
  - `ListingApprovalCard` ← from `LaunchSection.tsx` (764 lines)
  - `DisputeCard` ← from `DisputesSection.tsx` (345)
  - `PayoutCard` ← from `PayoutsSection.tsx` (226)
  - `StalledDeliveryCard` ← from `FulfillmentSection.tsx` (650)

Extraction means lifting the per-item card and **dropping the list/filter chrome**, which is what made those files large. `OurDropsSection` is `LaunchSection` minus the approval path.

**Data flow.** `AdminDashboardView` already subscribes to every collection involved. It passes them to `buildActionQueue` and renders the result. No new subscriptions.

## Error handling

- **Stale rows are already safe.** `verifyOrderPayment` (`alreadyVerified`), `releaseOrderEscrow` (`alreadyReleased`) and `activateSeller` are idempotent, so acting on a row someone else just handled answers idempotently rather than double-paying. The row disappears on the next snapshot.
- **A malformed document must never empty the queue.** The builder skips a row it cannot construct and keeps going — same discipline as `deadlineToMs` in `fulfillmentQueues.ts`, which rejects junk rather than coercing it to epoch 0 and marking everything eternally overdue.
- **Never invent an age.** A row whose timestamp is unusable sorts as `new` with no age shown, rather than displaying "waiting 56 years".

## Testing

- `src/utils/actionQueue.test.ts` — every reason code; ordering and all tie-breaks; malformed and missing timestamps; the empty state; and that an order in a healthy in-flight state produces **no** row (the regression that would refill the queue with noise).
- `src/utils/fulfillmentQueues.test.ts` — the 24h/24h thresholds, including the boundary instant.
- Cards: `npm run build` plus a browser pass. Component rendering tests are impossible here.

## Explicitly NOT in scope

- **CliQ / Arab Bank automation.** MJ wants payment verification programmatic eventually. The money rows are deliberately source-agnostic: when verification automates, those rows simply stop appearing. No redesign needed, so this wave invests **nothing** in prettier verify UI — only in moving it.
- **Trust-tier auto-publish** — audit says defer until active sellers > ~25–30. There are 9.
- **Seller-first dispute window** — deferred in the audit; one open dispute today.
- **Restructuring the reference tabs** (Orders, Members, Auction lookup, Audit, System). They are not the complaint.

## Preview gate

This deletes four tabs from the team's daily tool. Reversible, but it is the largest change to the admin surface in the whole audit. **MJ reviews the Vercel preview before merge** — desktop and phone, both languages — per the standing rule on customer-facing layout changes.

## Build process

Spec → implementation plan (`docs/superpowers/plans/`) → TDD build → PR → MJ preview → squash-merge. Same as Waves 0–3.
