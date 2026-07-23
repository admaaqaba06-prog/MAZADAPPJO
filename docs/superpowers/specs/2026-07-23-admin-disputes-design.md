# Admin UX — Slice D: "Disputes" (Job 4)

**Date:** 2026-07-23
**Status:** Approved (design), pending implementation plan
**Scope:** Handling issues arising from transactions (Job 4). Fourth and final core-job slice of the job-oriented admin reorganization (Slice A: Launch, Slice B: Verify & Approve, Slice C: Fulfillment).

## Context & Problem

Job 4 is "lower volume, highest stakes when it happens" — and today it's the crudest workflow in the admin. Verified in code (`src/utils/orderWorkflow.ts`, `src/components/OrderDetailsView.tsx`):

- **Opening a dispute captures no reason.** `handleOpenDispute` is a bare `window.confirm("Open a formal dispute?")` — the order flips to `disputed` with zero context about what went wrong.
- **Admin resolution is a native `prompt()`.** `handleCloseDispute` asks the admin to literally type the word `"release"`, `"refund"`, or `"resume"` into a browser prompt, with no note captured about *why* that resolution was chosen — no audit trail beyond the bare action type.
- **No dedicated queue.** Disputed orders are just a filter chip inside the general `ORDERS` tab; working a dispute means finding it in a long list and opening its detail modal.

The underlying money engine is sound and already reviewed/live: `release_escrow`/`refund_escrow` money movement runs through existing, tested Cloud Functions (`releaseOrderEscrow`, `refundOrderEscrow`), reached via `executeOrderTransition('resolve_dispute', ..., {resolutionType})`. **This slice does not touch that engine.**

## Goals

A `Disputes` admin tab — a real queue of `disputed` orders, oldest-first — plus the minimum data capture needed to make that queue useful, and a real resolution form replacing the `prompt()`.

### 1. Capture a reason when a dispute opens (required)
Per the confirmed decision: **a dispute cannot be opened with an empty reason.** `OrderDetailsView`'s existing "Open dispute" button gains a required reason text field (mirrors the existing pattern elsewhere in this file — a confirm dialog becomes a small inline form). The reason threads through `executeOrderTransition('open_dispute', ..., { disputeReason })` — a one-line addition to the existing `open_dispute` case in `orderWorkflow.ts` (same shape as the already-existing `trackingNumber` threading for `mark_shipped`). Buyer/seller-writable (it's their own transition, no rules change needed — same as `deliveryAddress` today).

### 2. Disputes admin tab
A queue of `status === 'disputed'` orders, oldest-first, each card showing: order/auction, buyer + seller, **the dispute reason**, and how long it's been open. Read-only data, no new listeners — sourced from the same `realOrders` the other three slices already use.

### 3. Real resolution form (replaces the `prompt()`)
Three resolution actions — **Release to seller**, **Refund buyer**, **Resume as paid** — each requiring an admin note before it can be submitted (same "reason required" discipline as Slice B's reject flow). Sequencing matters:
1. The UI calls the **existing, unchanged** `executeOrderTransition('resolve_dispute', ..., { resolutionType })` — the real money movement (or the resume status-flip) happens exactly as it does today. **Zero changes to `releaseOrderEscrow`/`refundOrderEscrow`.**
2. **Only on success**, the UI calls a new admin-only callable, `stampDisputeResolution({ orderId, resolutionType, notes })`, which stamps `resolutionNotes`, `disputeResolvedBy`, `disputeResolvedAt`, `disputeResolutionType` onto the order — informational metadata, not a money transition.

This ordering means a stamped note always corresponds to a resolution that actually happened; the reverse failure mode (money moved, note lost to a transient error) is harmless and non-blocking, matching the "never let a notification/metadata write block or roll back a money action" discipline used throughout this project.

## Architecture & Components

- **`src/utils/orderWorkflow.ts`** — one-line addition: `open_dispute` case writes `disputeReason: extraFields?.disputeReason || ''` alongside the existing `status: 'disputed'`. No other change to this file — `resolve_dispute`'s release/refund/resume branches are untouched.
- **`functions/disputeResolution.js`** (new) — pure, deps-injected: `stampDisputeResolution(deps, { orderId, resolutionType, adminUid, notes })`. Validates `resolutionType ∈ {release,refund,resume}` and non-empty `notes`; order must exist. Mirrors the `orderPaymentVerify.js`/`fulfillmentNudge.js` fake-db test pattern.
- **`functions/index.js`** — thin admin-gated callable wrapping the above (assertAdmin first, maps pure-module errors to HttpsError).
- **`firestore.rules`** — orders S2 denylist gains `resolutionNotes`, `disputeResolvedBy`, `disputeResolvedAt`, `disputeResolutionType` (admin-stamp-only, defense-in-depth — the `resume` branch is a plain client write today, so a non-admin forging these fields directly against Firestore must still be blocked server-side even though the app's own role check would prevent it through normal use).
- **`src/types.ts`** — `Order` gains `disputeReason?: string` (buyer/seller-writable) and the four admin-stamp fields above.
- **`src/components/admin/DisputesSection.tsx`** (new) — the queue + per-row resolution form (mirrors `PaymentVerifyCard`'s reject-reason UI pattern: pick an action, require a note, submit). Presentational, no Firestore imports.
- **`src/components/AdminDashboardView.tsx`** — new `'disputes'` tab (fourth core-job tab), wired the same way Slices B/C wired theirs (lazy import, `ADMIN_TABS` entry, tab-row + label ternaries + attention-dot + badge count, handler, mount block).
- **`src/components/OrderDetailsView.tsx`** — the existing "Open dispute" button gains a required reason text field before it can confirm.

## Data Flow

Buyer/seller clicks "Open dispute" → required reason → `executeOrderTransition('open_dispute', ..., {disputeReason})` → order `disputed` with `disputeReason` set → appears in the Disputes queue → admin reviews reason → picks a resolution + writes a required note → `executeOrderTransition('resolve_dispute', ..., {resolutionType})` (existing, unchanged — money moves) → on success, `stampDisputeResolution` records the note.

## Error Handling

- `stampDisputeResolution` never runs before the real resolution succeeds — the UI only calls it in the `.then()` of a successful `executeOrderTransition`.
- A failure in the stamp call is caught and surfaced as a soft warning (the resolution itself already succeeded) — never presented as if the resolution failed.
- Reason/note fields require non-empty, trimmed input client-side (fast feedback) AND server-side in `stampDisputeResolution` (defense-in-depth, same pattern as Slice B/C's reason validation).

## Testing

- **`orderWorkflow.ts`** `open_dispute` change: no test file exists for this module today (confirmed) — this slice does not backfill full coverage for the pre-existing file. Add one new, narrowly-scoped `orderWorkflow.test.ts` covering only the new behavior this slice introduces (the `disputeReason` write on `open_dispute`), not the rest of the module's untested surface.
- **`disputeResolution.js`**: pure-module tests — valid resolution stamps all four fields; empty/whitespace notes rejected; invalid `resolutionType` rejected; missing order → not-found.
- Manual smoke (needs live/simulated data, MJ/colleague): open a dispute with a reason → appears in the Disputes queue with that reason visible; resolve via each of the three actions with a note → money moves exactly as before (unchanged engine) AND the note is visible on the order afterward; attempt to resolve with an empty note → blocked client-side.

## Non-Goals (YAGNI)

- Evidence/photo uploads for disputes (real potential feature, explicitly deferred — no upload UI, storage rules, or moderation exists today and building it is a separate scope).
- Any change to the dispute state machine, `releaseOrderEscrow`, or `refundOrderEscrow` — the money engine is correct and stays untouched.
- In-app messaging/mediation UI between buyer and seller.
- SLA timers or auto-escalation on aged disputes (unlike Slice C's fulfillment buckets, disputes get no overdue-threshold automation in this slice — human judgment stays central given the stakes).
- The role-based admin shell (north-star, unchanged).
