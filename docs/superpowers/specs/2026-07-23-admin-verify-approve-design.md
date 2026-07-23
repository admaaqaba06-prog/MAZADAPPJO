# Admin UX — Slice B: "Verify & Approve" (Job 1)

**Date:** 2026-07-23
**Status:** Approved (design), pending implementation plan
**Scope:** The team's payment-verification + membership-approval workflow (Job 1). Second slice of the job-oriented admin reorganization (see Slice A: `2026-07-23-admin-launch-slice-design.md`).

## Context & Problem

Job 1 — "verify payment & approve members" — is the team's highest daily-volume job, and today it's smeared across three entity tabs in `AdminDashboardView.tsx`: `PREMIUM SUBS` (subscription approvals), `CLIQ PAYMENTS` (a wallet-deposit/top-up flow), and `MEMBERS`. Processing "someone paid, approve them" means hopping tabs and reassembling context by hand. Receipt review is a tiny "VIEW" link, and the receipt image URL is read through a fragile five-field fallback (`receiptUrl ?? paymentProofUrl ?? paymentProofImage ?? proofUrl ?? paymentImageUrl`).

**Key domain correction (confirmed with MJ):** there is **no deposit-to-bid concept**. The wallet deposit/top-up flow behind `CLIQ PAYMENTS` (`escrows` with `auctionId: 'cliq-dep'`, `requestTopUp`, `releaseEscrow`) is **vestigial** and out of scope. It is **left as-is** (not deleted) this slice; Slice B simply does not build on it.

That leaves **two** real payment/approval streams the team works, which map onto two focused sub-views:
1. **Memberships** — subscription/membership requests: verify the CliQ receipt → grant membership or reject.
2. **Order payments** — a buyer paying (CliQ) for a won auction: verify the receipt → mark the order paid or reject.

## Goals

A `Verify & Approve` admin section with **two focused sub-views**, both built on **one shared verify core**, so a reviewer sees everything needed to make a confident yes/no in one place.

### The shared verify core (built once, used by both sub-views)
A reusable review-card unit presenting:
- **Receipt viewer** — the CliQ transfer screenshot shown **large and inline, tap-to-zoom** (replaces the current tiny "VIEW" link). Fed by a new **receipt-normalization util** that resolves the fragmented field names into one shape, so no consumer repeats the five-field fallback.
- **Amount-match** — the expected amount shown beside the receipt, visually flagged when the submitted/expected amounts don't match.
- **Payer identity** — the member's name + phone, so the reviewer can match the CliQ sender to the account.
- **Duplicate-receipt guard** — warn when the same receipt image reference has already been submitted (catches re-used screenshots).
- **Approve** and **Reject-with-reason** actions inline.

### Sub-view 1 — Memberships
The subscription-request review queue **only** (not a broader "manage all members" screen — confirmed). Each request renders through the verify core. **Approve** grants membership via the existing server-only `approveSubscription` callable; **Reject** captures a reason via `rejectSubscription` and notifies the user (see Reject flow). Grants stay 100% server-authoritative — the client never writes membership/subscription state.

### Sub-view 2 — Order payments
Won orders in `waiting_payment` that carry a submitted buyer receipt (`paymentProofUrl`), rendered through the verify core. **This is the seam with Slice C (fulfillment):** Slice B ends at "payment verified → order marked `paid`"; Slice C picks up everything from `paid` onward (preparing → shipped → delivered → escrow release). Slice B builds NO post-paid UI.

**Net-new backend (money-path):** a `confirmOrderPayment` admin-only callable that transitions an order `waiting_payment → paid` (sets `paymentStatus: 'paid'`, `status: 'paid'`, stamps verifier + timestamp). This does not exist today — no writer moves an order to paid. The client must never write this transition; it goes through the callable, gated in `firestore.rules` + verified `isAdmin` server-side.

### Reject flow (both sub-views)
Reject requires a short reason (pick-list + free text) and **notifies the user** so they can fix and resubmit, closing the loop. Reuses the existing `rejectionReason` field pattern (already used for auctions + withdrawals) and the `postToN8n` WhatsApp pipe. Two **new n8n events**: `membership_rejected` and `order_payment_rejected`, each carrying `{ phone, name, reason, ... }`. Membership reject already downgrades via `rejectSubscription`; this slice adds the reason + notification to that path and the new order-payment path.

## Architecture & Components

- **`src/utils/paymentReceipt.ts`** (new) — `normalizeReceiptUrl(record)` → single resolved URL (absorbs the five-field fallback + the sub `paymentProofImage` + order `paymentProofUrl`); `receiptFingerprint(record)` for the duplicate guard. Pure, unit-tested.
- **`src/components/admin/PaymentVerifyCard.tsx`** (new) — the shared verify-core card (receipt viewer, amount-match, payer identity, dup-guard badge, approve/reject-with-reason). Presentational + callback props; no Firestore writes of its own.
- **`src/components/admin/VerifyApproveSection.tsx`** (new) — hosts the two sub-views (tab/segment switch: Memberships | Order payments) + per-sub-view counts.
- **`functions/index.js`** — add `confirmOrderPayment` callable; add `postToN8n('membership_rejected'|'order_payment_rejected', …)`; extend `rejectSubscription` to carry a reason + fire the notify.
- **`firestore.rules`** — ensure order `paid` transition is not client-writable (confirm current rule; the callable bypasses rules server-side).
- **n8n** — two new webhook branches (assisted, documented) for the reject events. If the workflow isn't updated, `postToN8n` no-ops safely (unset `N8N_WEBHOOK_URL` / unknown event → no-op), so the app never breaks on a missing branch.
- **`AdminDashboardView.tsx`** — mount the new `Verify & Approve` section; leave the existing `CLIQ PAYMENTS` (deposit) tab untouched.

## Data Flow

**Membership:** user submits sub request + `paymentProofImage` → appears in Memberships queue → reviewer verifies via card → Approve (`approveSubscription`, server grants tier/expiry) OR Reject (reason → `rejectSubscription` downgrades + `membership_rejected` notify).

**Order payment:** buyer wins → order `waiting_payment` → buyer uploads `paymentProofUrl` on the order → appears in Order-payments queue → reviewer verifies via card → Confirm (`confirmOrderPayment` → `paid`) hands off to Slice C OR Reject (reason → order stays `waiting_payment`/flagged + `order_payment_rejected` notify).

## Error Handling

- All state-changing actions are **server callables** (`approveSubscription`, `rejectSubscription`, `confirmOrderPayment`); the client never writes grant/paid/money state directly. `confirmOrderPayment` re-checks `isAdmin` and the order's current status server-side (idempotent: no-op/deny if already `paid`).
- `normalizeReceiptUrl` returns null for a missing/invalid receipt; the card shows a "no receipt attached" state and **disables Approve/Confirm** (can't verify what isn't there) — matching today's disabled-on-no-receipt behavior.
- Duplicate guard is a **warning, not a hard block** (a legitimate resubmit can reuse an image); the reviewer decides.
- `postToN8n` reject notifications are best-effort and must never block or fail the approve/reject transaction (fire post-commit, swallow errors) — same discipline as the settle-path webhooks.

## Testing

- **`paymentReceipt` util:** unit tests — resolves each field-name variant, null on none, stable fingerprint, dup detection.
- **`confirmOrderPayment`:** emulator/behavior test — moves `waiting_payment → paid`, sets verifier + timestamp; denies non-admin; idempotent on already-`paid`; never runs on a non-existent/ineligible order.
- **PaymentVerifyCard:** amount-match flag fires on mismatch; approve/confirm disabled with no receipt; dup-guard badge renders on a repeat fingerprint.
- **Reject:** reason required; the correct n8n event fires with the reason (mock `postToN8n`).
- Manual smoke (needs live/simulated data, MJ/colleague — Claude can't auth): verify a real membership receipt end-to-end; verify an order win-payment → order flips to `paid`; reject with a reason → user receives the WhatsApp notice.

## Non-Goals (YAGNI)

- Wallet deposits / top-ups (vestigial — no deposit-to-bid; old tab left as-is, not extended).
- The role-based admin shell / cross-job "needs attention" home (north-star; a later step).
- Slice C fulfillment — everything post-`paid` (ship/deliver/release/dispute).
- A broad "manage all members" roster (block/unblock/edit/manual-grant beyond what approval needs).
- OCR / auto-reading receipt amounts — human verification stays the trust moat.
- Deleting or migrating the old deposit/escrow flow.

## Open Items

- **n8n branches** for `membership_rejected` / `order_payment_rejected` are assisted-post edits to the workflow (like Slice A's channel posting); the code degrades safely if they're not yet added. Wire them when the code lands.
- Confirm during planning whether the recently-merged `security-rules-hardening` (PR #61) changed the subscription/order rules or the approve/reject callables — ground the plan against current `functions/index.js` + `firestore.rules`.
