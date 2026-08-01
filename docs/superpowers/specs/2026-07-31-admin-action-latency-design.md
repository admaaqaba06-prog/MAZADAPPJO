# Admin Action Latency (Design Spec)

**Date:** 2026-07-31 · **Status:** LOCKED with MJ.

## Why

MJ: *"admin buttons need some sort of optimistic ux bc the wait is too long for each of the buttons."*

Measured against production on 2026-07-31, calling an admin callable that does **no work at all** (rejected at auth, so this is pure network + startup):

| call | elapsed |
|---|---|
| 1 (cold) | **2021 ms** |
| 2 (warm) | 486 ms |
| 3 (warm) | 448 ms |

`placeBid` is the **only** function in the codebase carrying `minInstances`. Its own comment (`index.js:1699`) already documents this exact problem — *"so the first bid of a drop doesn't eat a 2-5s cold start"* — load-tested 2026-07-24. The measurement above is independent corroboration on the admin path.

There is also **no busy state anywhere in `AdminDashboardView`** (grepped: zero matches for busy/pending/loading state). So for those two seconds the button gives no feedback at all. That is why it reads as broken rather than merely slow.

## The finding that shapes the design: two different latencies

The eleven Action Center handlers do **not** share a latency profile.

| Handler | Backing | Latency source |
|---|---|---|
| `onApproveOrderPayment` / `onRejectOrderPayment` | `verifyOrderPayment` callable | cold start + txn + listener |
| `onApproveMembership` / `onRejectMembership` | `approveSubscription` / `rejectSubscription` | cold start + txn + listener |
| `onApprovePayout` / `onRejectPayout` | `approveWithdrawal` / `rejectWithdrawal` | cold start + txn + listener |
| `onNudge` | `sendFulfillmentNudge` | cold start + n8n POST |
| `onResolveDispute` | callable | cold start + txn + listener |
| **`onApproveListing` / `onRejectListing`** | **direct client Firestore write in `AppContext`** | **listener only — no server round-trip** |

Warming instances does nothing for listing approve/reject — they have no server round-trip at all.

> **CORRECTION (2026-08-01, whole-branch review).** The sentence that stood here — that their
> entire wait is the snapshot propagating, so their fix is purely client-side — was **wrong**,
> and the optimistic-hide design was built on it.
>
> `AppContext.approveListing` already flips the lot to `live` via `setAuctions` **synchronously**,
> in the same React batch as the click, and `pendingListingDrops` filters on status. So the row
> left the queue instantly *before this feature existed*. There was never a wait to fix.
>
> Consequences, recorded so nobody re-derives a decision from the original claim:
> - The optimistic hide is a **no-op at both of its permitted call sites**. `hidden`,
>   `visibleRows` and `pruneHidden` add no user-visible behaviour today. They are defence in
>   depth if that local flip is ever removed — which is a real possibility, since it is the
>   thing that makes a failed write need `restoreLocalAuction`.
> - `busy` on `ListingApprovalCard` **can never render**: the card unmounts in the same batch.
> - The branch's real value is the warmer, the pending state on the six *callable-backed*
>   buttons, and three pre-existing bugs found while wiring.
>
> The error was mine: I read the call path and never traced one click through to the row
> leaving the queue. Five per-task reviews could not see it; only an end-to-end trace could.

## Decisions taken with MJ (2026-07-31)

1. **Both halves.** Fix the real latency (cold start) *and* the perceived latency (no feedback). Either alone leaves half the complaint standing.
2. **A scheduled warmer, not `minInstances`.** `minInstances` is the guarantee, but at ~$70/month for six 256 MB instances it buys 1.5 seconds on a surface one operator touches. A warmer costs roughly 1% of that. MJ chose the warmer knowingly, accepting that Google may still evict an instance between pings — a cold start after eviction is exactly today's behaviour, so the downside is "no better than now", never worse. `minInstances` stays available per-function if measurement shows the warmer is not holding.
3. **Money actions are never optimistic.** They get an immediate pending state, but the row **stays in the queue until the server confirms**. An admin must never be shown "done" for money that has not moved.
4. **The nudge counts as a money-class action** despite moving no money: it sends a real WhatsApp, and an unsend does not exist. Showing "sent" for a message that failed is the same category of lie.
5. **Only listing approve/reject is optimistic.** A spec self-review caught the first draft misclassifying two actions, which is worth recording because it is the exact failure this design warns about:
   - `handleResolveDispute` calls `executeOrderTransition(order, 'resolve_dispute', …)` first, and its own comment reads *"the REAL resolution — untouched, existing engine (money moves here)"*. The admin's note is reversible; the resolution is not, and one button does both.
   - `handleAdvanceOrder` calls `executeOrderTransition` with a status-dependent action, and some targets release escrow. Whether it moves money depends on the row it is pressed on — so it is money-class by default, because a classification that has to be re-derived per row is not a classification.

   That leaves exactly two optimistic actions. This turns out to be coherent rather than disappointing: listing approve/reject are the only two with **no server round-trip to warm**, so optimism is the sole fix available to them, and they are the highest-volume admin action (every drop needs approval).

## Cost, stated honestly

**The option not taken:** six 256 MB / 400 MHz 1st-gen instances held warm via `minInstances` would run roughly **$12/month each — ~$70/month** at published rates (~$0.0000025/GB-s, ~$0.0000100/GHz-s), dominated by CPU. That is an estimate from the rate card, not a figure read off the bill; `placeBid` already runs one such instance, so the true per-instance cost is visible in current billing if it is ever worth checking.

**The option taken:** one scheduled function running every 5 minutes, issuing six sub-second pings — about 52,000 invocations/month totalling a few hundred GB-seconds. That sits **inside the free tier**, so the expected marginal cost is effectively zero.

Given the May 2026 runaway-bill incident, the cheap option that cannot surprise anyone is the right default. If a week of measurement shows admin actions still landing cold, buying `minInstances` for the specific offender is a one-line change.

## Architecture

### Server: `warmAdminCallables`, a scheduled pinger

A new scheduled function, every 5 minutes, POSTing a no-op payload to the six admin callables: `verifyOrderPayment`, `approveSubscription`, `rejectSubscription`, `approveWithdrawal`, `rejectWithdrawal`, `sendFulfillmentNudge`.

**The ping must not arrive as an auth failure.** The obvious implementation — POST with no credentials and let the existing `unauthenticated` throw spin the container — does warm the instance (measured: the 2021 ms cold call above *was* an unauthenticated rejection). But it would emit ~1,700 authentication errors per day into Cloud Logging, which destroys the only signal that would reveal a real unauthorised attempt. Warming the functions must not cost the ability to see an attack on them.

So each of the six gains one line, ahead of its auth check:

```js
if (data && data.__warm === true) return { warm: true };
```

It reads nothing, writes nothing, and returns nothing. **Named risk:** this is reachable unauthenticated, so a third party could invoke it to spin an instance. That is the same amplification the existing auth-rejection path already offers, and the response carries no information, so it changes the attack surface's shape rather than its size. It is called out here so a future reader does not discover it and assume it was an oversight.

**No `maxInstances`** — admin actions are single-operator, so there is no burst to bound, and adding a ceiling here would cargo-cult `placeBid`'s load-test conclusion into a context that never had the problem.

The warmer's own cold start is irrelevant: nothing waits on it.

### Client: one hook, `useAdminAction`

A single shared hook wrapping every Action Center handler, so eleven call sites cannot drift into eleven behaviours.

```
useAdminAction() -> {
  run(actionId, kind, fn),   // kind: 'reversible' | 'confirmed'
  isPending(actionId),
  optimisticallyHidden        // Set<string> of queue ids to drop
}
```

- **On click, always:** mark `actionId` pending. The button spins and stops accepting input; the row dims. This is the whole fix for the "did my click register?" problem and it applies to all eleven, including the two client-write ones.
- **`kind: 'reversible'`** — **`onApproveListing` and `onRejectListing` only.** Additionally add the row id to `optimisticallyHidden` so it leaves the queue instantly. On failure, remove it — the row returns — and raise an error toast. Safe because neither moves money, both are client-side Firestore writes, and an approval can be undone by a rejection.
- **`kind: 'confirmed'`** — **everything else**: payment verify/reject, membership approve/reject, payout approve/reject, dispute resolve, order advance, nudge. Pending state only; the row stays until the listener delivers the real state.

`AdminDashboardView` filters `buildActionQueue`'s output through `optimisticallyHidden` before rendering. The queue builder itself stays pure and untouched — it already has 60+ tests and no business knowing about in-flight UI.

### Reconciliation

The Firestore listener remains the source of truth. `optimisticallyHidden` entries are dropped when the row disappears from the real queue (the write landed) or on failure (rollback). An entry that is still hidden after a timeout is a bug, not a state to design around — but the pending flag clears on settle either way, so a stuck entry can never leave a permanently dead button.

## Error handling

- Failure clears pending, rolls back any optimistic hide, and raises a toast carrying the server's Arabic message.
- The existing callable wrappers already return `{success:false, message}` rather than throwing (`AppContext` pattern). The hook must handle **both** that shape and a thrown error — the Second Chance card shipped a bug in exactly this gap.
- A second click while pending is ignored at the hook, not merely disabled at the button.

## Testing

Vitest here is `environment: 'node'` — no jsdom, no `@testing-library`. Component rendering cannot be tested.

- The hook's **state machine** is extracted pure (`src/utils/adminActionState.ts`) and unit-tested: pending set/clear, optimistic hide/rollback, double-click suppression, both failure shapes, and that `kind: 'confirmed'` **never** produces an optimistic hide.
- A source-text wiring assertion that **`'reversible'` appears at exactly two call sites**, both listing handlers. Asserting the allowlist rather than the denylist means a newly-added money action is `'confirmed'` by omission — the safe default — and any attempt to widen optimism fails loudly. The classification is the safety property, and a regression there is otherwise silent.
- The warmer's **target list** pinned by a source assertion: every callable backing a money-class Action Center handler must appear in it. A function silently dropped from the list reverts to 2-second cold starts with nothing failing, which is precisely the class of regression no test would otherwise catch.
- The `__warm` short-circuit asserted to sit **above** each function's auth check (it is useless below it) and to return before any Firestore access.

## Explicitly NOT in scope

- `maxInstances` tuning on admin callables.
- `minInstances` anywhere. Available as a targeted follow-up if measurement demands it; not bought up front.
- Migrating to 2nd-gen functions (cheaper idle billing) — a separate, larger decision.
- Optimistic UX anywhere outside the Action Center.
- Making `approveListing`/`rejectListing` into callables. They are direct writes today; changing that is a security question, not a latency one.

## Risk to name plainly

**The warmer can be evicted.** Google gives no guarantee that a 5-minute ping keeps an instance alive; under memory pressure or a platform event an admin action can still land cold. The failure mode is a 2-second wait — today's behaviour — so the warmer is never worse than the status quo, only sometimes not better. Worth one week of observation before concluding it works.

Optimistic UI on an admin surface trades honesty for speed. The mitigation is the money/reversible split, and the split is only as good as its classification — which is why it is asserted in tests rather than left to reviewer memory. If the classification is ever wrong, an admin sees "done" for something that did not happen, on a surface where that means real money.
